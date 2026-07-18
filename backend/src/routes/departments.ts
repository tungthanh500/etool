import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { audit } from "../lib/audit";

const router = Router();

router.use(authenticate, authorize("user:manage"));

const departmentSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên phòng ban"),
});

router.get("/", async (_req, res, next) => {
  try {
    res.json(await prisma.department.findMany({ orderBy: { name: "asc" } }));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = departmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }

    const department = await prisma.department.create({ data: { name: parsed.data.name } });
    audit({ req, category: "USER", action: "DEPT_CREATE", targetType: "department", targetId: department.id, detail: department.name });
    res.status(201).json(department);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(409, "Tên phòng ban đã tồn tại"));
      return;
    }
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const parsed = departmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }

    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: { name: parsed.data.name },
    });
    audit({ req, category: "USER", action: "DEPT_UPDATE", targetType: "department", targetId: department.id, detail: department.name });
    res.json(department);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(409, "Tên phòng ban đã tồn tại"));
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      next(new AppError(404, "Không tìm thấy phòng ban"));
      return;
    }
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
    await prisma.department.delete({ where: { id: req.params.id } });
    audit({ req, category: "USER", action: "DEPT_DELETE", targetType: "department", targetId: req.params.id, detail: existing?.name });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      next(new AppError(404, "Không tìm thấy phòng ban"));
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      // FK có thể là User HOẶC WorkflowStep (mục 5.6 — bước duyệt chỉ định phòng ban này)
      // — không phân biệt được từ mã lỗi, dùng message chung thay vì đổ oan cho user.
      next(new AppError(409, "Không thể xoá: vẫn còn user hoặc luồng duyệt đang dùng phòng ban này"));
      return;
    }
    next(err);
  }
});

export default router;
