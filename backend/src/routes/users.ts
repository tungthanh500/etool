import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const router = Router();

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  roleId: true,
  departmentId: true,
  createdAt: true,
  role: true,
  department: true,
} as const;

router.use(authenticate, authorize("user:manage"));

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1, "Thiếu họ tên"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  roleId: z.string().min(1, "Thiếu vai trò"),
  departmentId: z.string().min(1, "Thiếu phòng ban"),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  roleId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
});

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
    const { email, fullName, password, roleId, departmentId } = parsed.data;

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, fullName, passwordHash, roleId, departmentId },
      select: SAFE_USER_SELECT,
    });
    res.status(201).json(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(409, "Email đã tồn tại"));
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
    const { fullName, roleId, departmentId, password } = parsed.data;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(fullName !== undefined ? { fullName } : {}),
        ...(roleId !== undefined ? { roleId } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
        ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}),
      },
      select: SAFE_USER_SELECT,
    });
    res.json(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      next(new AppError(404, "Không tìm thấy user"));
      return;
    }
    next(err);
  }
});

export default router;
