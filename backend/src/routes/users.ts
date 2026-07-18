import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { audit } from "../lib/audit";

const router = Router();

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  roleId: true,
  departmentId: true,
  createdAt: true,
  mustChangePassword: true,
  isActive: true,
  role: true,
  department: true,
} as const;

router.use(authenticate, authorize("user:manage"));

// Tên đăng nhập: 3-32 ký tự, chữ thường/số/dấu chấm/gạch dưới/gạch nối, bắt đầu bằng chữ/số.
// Chỉ Admin đặt/đổi được (user không tự đổi qua /auth/profile — tránh tự khoá mình ngoài).
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, "Tên đăng nhập 3-32 ký tự: chữ thường, số, dấu chấm/gạch dưới/gạch nối, bắt đầu bằng chữ hoặc số");

const createUserSchema = z.object({
  username: usernameSchema,
  email: z.string().email(),
  fullName: z.string().min(1, "Thiếu họ tên"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  roleId: z.string().min(1, "Thiếu vai trò"),
  departmentId: z.string().min(1, "Thiếu phòng ban"),
});

const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  email: z.string().email().optional(),
  fullName: z.string().min(1).optional(),
  roleId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
});

// P2002 = vi phạm unique — phân biệt cột nào để message không đánh lừa người dùng.
function uniqueViolationMessage(err: Prisma.PrismaClientKnownRequestError): string {
  const target = err.meta?.target;
  const cols = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return cols.includes("username") ? "Tên đăng nhập đã tồn tại" : "Email đã tồn tại";
}

router.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: "asc" },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: SAFE_USER_SELECT,
    });
    if (!user) throw new AppError(404, "Không tìm thấy user");
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    const { username, email, fullName, password, roleId, departmentId } = parsed.data;

    const passwordHash = await hashPassword(password);
    // Admin cấp mật khẩu ban đầu — buộc user tự đổi ở lần đăng nhập kế tiếp (mục 1.2).
    const user = await prisma.user.create({
      data: { username, email, fullName, passwordHash, roleId, departmentId, mustChangePassword: true },
      select: SAFE_USER_SELECT,
    });
    audit({ req, category: "USER", action: "USER_CREATE", targetType: "user", targetId: user.id, detail: user.username });
    res.status(201).json(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(409, uniqueViolationMessage(err)));
      return;
    }
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    const { username, email, fullName, roleId, departmentId, password, isActive } = parsed.data;

    if (isActive === false && req.params.id === req.user!.id) {
      throw new AppError(400, "Không thể tự vô hiệu hoá tài khoản của chính mình");
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(username !== undefined ? { username } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(fullName !== undefined ? { fullName } : {}),
        ...(roleId !== undefined ? { roleId } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
        // Admin reset mật khẩu người khác — buộc đổi lại ở lần đăng nhập kế tiếp (mục 1.2).
        ...(password !== undefined ? { passwordHash: await hashPassword(password), mustChangePassword: true } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      select: SAFE_USER_SELECT,
    });
    audit({ req, category: "USER", action: "USER_UPDATE", targetType: "user", targetId: user.id, detail: user.email });
    if (isActive !== undefined) {
      audit({ req, category: "USER", action: isActive ? "USER_ENABLE" : "USER_DISABLE", targetType: "user", targetId: user.id, detail: user.email });
    }
    res.json(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(409, uniqueViolationMessage(err)));
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      next(new AppError(404, "Không tìm thấy user"));
      return;
    }
    next(err);
  }
});

export default router;
