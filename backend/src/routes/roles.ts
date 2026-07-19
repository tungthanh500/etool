import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { audit } from "../lib/audit";
import { PERMISSION_KEYS } from "@etool/shared";

const router = Router();

router.use(authenticate, authorize("user:manage"));

// Permission hợp lệ = catalog trong @etool/shared + wildcard "*" (toàn quyền).
// Validate ở đây để Admin không lưu được chuỗi quyền vô nghĩa vào DB.
const VALID_PERMISSIONS = new Set<string>([...PERMISSION_KEYS, "*"]);

const roleSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên vai trò").max(50, "Tên vai trò tối đa 50 ký tự"),
  permissions: z
    .array(z.string())
    .refine((perms) => perms.every((p) => VALID_PERMISSIONS.has(p)), "Có quyền không hợp lệ trong danh sách"),
});

// Loại trùng lặp; "*" là toàn quyền nên nếu có thì chỉ giữ mình nó cho gọn dữ liệu.
function normalizePermissions(perms: string[]): string[] {
  const unique = [...new Set(perms)];
  return unique.includes("*") ? ["*"] : unique;
}

// Kèm _count.users để trang danh sách hiện "N tài khoản đang giữ vai trò này".
// Shape phần Role giữ nguyên như GET /api/roles cũ (routes/meta.ts trước đây) —
// UserFormPage/WorkflowFormPage dùng tiếp không phải sửa.
router.get("/", async (_req, res, next) => {
  try {
    res.json(
      await prisma.role.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { users: true } } },
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }

    const role = await prisma.role.create({
      data: { name: parsed.data.name, permissions: normalizePermissions(parsed.data.permissions) },
    });
    audit({ req, category: "USER", action: "ROLE_CREATE", targetType: "role", targetId: role.id, detail: role.name });
    res.status(201).json(role);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(409, "Tên vai trò đã tồn tại"));
      return;
    }
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    const permissions = normalizePermissions(parsed.data.permissions);

    // Guard tự khoá: sửa role CHÍNH MÌNH đang giữ mà bỏ cả "*" lẫn "user:manage" thì
    // sau request này không còn ai chắc chắn vào được trang quản trị — chặn từ đầu.
    if (
      req.params.id === req.user!.roleId &&
      !permissions.includes("*") &&
      !permissions.includes("user:manage")
    ) {
      throw new AppError(400, "Không thể tự tước quyền quản trị của vai trò bạn đang giữ");
    }

    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: { name: parsed.data.name, permissions },
    });
    audit({ req, category: "USER", action: "ROLE_UPDATE", targetType: "role", targetId: role.id, detail: role.name });
    res.json(role);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(409, "Tên vai trò đã tồn tại"));
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      next(new AppError(404, "Không tìm thấy vai trò"));
      return;
    }
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (req.params.id === req.user!.roleId) {
      throw new AppError(400, "Không thể xoá vai trò bạn đang giữ");
    }

    const userCount = await prisma.user.count({ where: { roleId: req.params.id } });
    if (userCount > 0) {
      throw new AppError(409, `Không thể xoá: còn ${userCount} tài khoản đang giữ vai trò này`);
    }

    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    await prisma.role.delete({ where: { id: req.params.id } });
    audit({ req, category: "USER", action: "ROLE_DELETE", targetType: "role", targetId: req.params.id, detail: existing?.name });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      next(new AppError(404, "Không tìm thấy vai trò"));
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      // Lưới an toàn thứ hai (race giữa count và delete) — FK restrict từ User.roleId.
      next(new AppError(409, "Không thể xoá: vẫn còn tài khoản đang giữ vai trò này"));
      return;
    }
    next(err);
  }
});

export default router;
