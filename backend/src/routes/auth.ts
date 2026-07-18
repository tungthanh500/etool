import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { CookieOptions } from "express";
import rateLimit from "express-rate-limit";
import { Prisma } from "@prisma/client";
import type { Department, Role, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { comparePassword, hashPassword } from "../lib/password";
import { signToken, verifyToken } from "../lib/jwt";
import { authenticate } from "../middlewares/authenticate";
import { audit } from "../lib/audit";
import { AppError } from "../lib/errors";
import { signatureUpload, verifySignatureMagicBytes, UPLOAD_DIR } from "../lib/upload";

const router = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau ít phút" },
});

const COOKIE_NAME = process.env.COOKIE_NAME || "eapproval_token";
const COOKIE_MAX_AGE_MS = 10 * 60 * 60 * 1000; // 10h, khớp JWT_EXPIRES_IN mặc định

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, "Mật khẩu mới tối thiểu 8 ký tự"),
});

// Tự sửa hồ sơ cá nhân — chỉ họ tên + email liên hệ (vai trò/phòng ban do Admin quản lý).
// KHÔNG cho tự đổi username: đó là tên đăng nhập, đổi nhầm là tự khoá mình ngoài hệ thống
// (bài học sự cố 2026-07-17 khi email còn là tên đăng nhập). Ít nhất một trường phải có mặt.
const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1, "Họ tên không được để trống").optional(),
    email: z.string().trim().email("Email không hợp lệ").optional(),
  })
  .refine((v) => v.fullName !== undefined || v.email !== undefined, {
    message: "Không có thông tin nào để cập nhật",
  });

function toSafeUser(user: User & { role: Role; department: Department }) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

router.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Tên đăng nhập hoặc mật khẩu không hợp lệ" });
      return;
    }

    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { username },
      include: { role: true, department: true },
    });

    // actorEmail của audit ghi "định danh đăng nhập được nhập" — nay là username.
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      audit({ req, category: "AUTH", action: "LOGIN_FAILED", actorEmail: username });
      res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng" });
      return;
    }

    if (!user.isActive) {
      audit({ req, category: "AUTH", action: "LOGIN_FAILED", actorId: user.id, actorEmail: username, detail: "Tài khoản bị vô hiệu hoá" });
      res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng" });
      return;
    }

    const token = signToken(user.id);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: COOKIE_MAX_AGE_MS });
    audit({ req, category: "AUTH", action: "LOGIN", actorId: user.id, actorEmail: user.email });
    res.json(toSafeUser(user));
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  // Giải mã cookie best-effort để ghi được ai đã đăng xuất (route không authenticate).
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const { sub } = verifyToken(token);
      audit({ req, category: "AUTH", action: "LOGOUT", actorId: sub });
    } catch {
      // token hỏng/hết hạn — vẫn xoá cookie, chỉ không ghi được actor.
    }
  }
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(204).send();
});

router.get("/me", authenticate, (req, res) => {
  res.json(toSafeUser(req.user!));
});

router.patch("/profile", authenticate, async (req, res, next) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    const { fullName, email } = parsed.data;

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(fullName !== undefined ? { fullName } : {}),
        ...(email !== undefined ? { email } : {}),
      },
      include: { role: true, department: true },
    });

    audit({ req, category: "USER", action: "PROFILE_UPDATE", targetType: "user", targetId: updated.id, detail: updated.email });
    res.json(toSafeUser(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(409, "Email đã tồn tại"));
      return;
    }
    next(err);
  }
});

router.post("/change-password", authenticate, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    const { oldPassword, newPassword } = parsed.data;

    const matches = await comparePassword(oldPassword, req.user!.passwordHash);
    if (!matches) {
      throw new AppError(400, "Mật khẩu hiện tại không đúng");
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash, mustChangePassword: false },
      include: { role: true, department: true },
    });

    audit({ req, category: "AUTH", action: "PASSWORD_CHANGE", targetType: "user", targetId: updated.id });
    res.json(toSafeUser(updated));
  } catch (err) {
    next(err);
  }
});

router.get("/signature", authenticate, (req, res, next) => {
  try {
    if (!req.user!.signatureUrl) {
      throw new AppError(404, "Chưa có chữ ký mẫu");
    }
    const filePath = path.join(UPLOAD_DIR, req.user!.signatureUrl);
    if (!fs.existsSync(filePath)) {
      throw new AppError(404, "File chữ ký không còn tồn tại trên máy chủ");
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/signature",
  authenticate,
  signatureUpload.single("signature"),
  verifySignatureMagicBytes,
  async (req, res, next) => {
    const file = req.file as Express.Multer.File | undefined;
    try {
      if (!file) {
        throw new AppError(400, "Thiếu file chữ ký");
      }

      const previousUrl = req.user!.signatureUrl;
      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data: { signatureUrl: file.filename },
        include: { role: true, department: true },
      });

      if (previousUrl) {
        fs.unlink(path.join(UPLOAD_DIR, previousUrl), (unlinkErr) => {
          if (unlinkErr) console.error(`Lỗi xóa chữ ký cũ: ${previousUrl}`, unlinkErr);
        });
      }

      audit({ req, category: "USER", action: "SIGNATURE_SET", targetType: "user", targetId: updated.id });
      res.status(201).json(toSafeUser(updated));
    } catch (err) {
      if (file) {
        fs.unlink(file.path, (unlinkErr) => {
          if (unlinkErr) console.error(`Lỗi xóa file mồ côi: ${file.path}`, unlinkErr);
        });
      }
      next(err);
    }
  },
);

router.delete("/signature", authenticate, async (req, res, next) => {
  try {
    const previousUrl = req.user!.signatureUrl;
    if (!previousUrl) {
      throw new AppError(404, "Chưa có chữ ký mẫu");
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: { signatureUrl: null },
      include: { role: true, department: true },
    });

    fs.unlink(path.join(UPLOAD_DIR, previousUrl), (unlinkErr) => {
      if (unlinkErr) console.error(`Lỗi xóa chữ ký: ${previousUrl}`, unlinkErr);
    });

    audit({ req, category: "USER", action: "SIGNATURE_CLEAR", targetType: "user", targetId: updated.id });
    res.json(toSafeUser(updated));
  } catch (err) {
    next(err);
  }
});

export default router;
