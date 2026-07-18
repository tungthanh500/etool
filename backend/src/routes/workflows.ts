import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { audit } from "../lib/audit";

const router = Router();

const WORKFLOW_INCLUDE = {
  steps: { orderBy: { stepOrder: "asc" as const } },
};

const stepsSchema = z
  .array(z.string().trim().min(1))
  .min(1, "Cần ít nhất 1 bước duyệt");

const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên loại văn bản"),
  description: z.string().trim().optional(),
  steps: stepsSchema,
});

const updateWorkflowSchema = z.object({
  description: z.string().trim().optional(),
  steps: stepsSchema.optional(),
});

// Xác nhận mọi tên vai trò trong `steps` khớp Role có thật trong DB —
// tránh tạo bước duyệt trỏ tới vai trò không tồn tại, không ai duyệt được.
async function assertRolesExist(steps: string[]): Promise<void> {
  const uniqueNames = [...new Set(steps)];
  const found = await prisma.role.findMany({ where: { name: { in: uniqueNames } } });
  if (found.length !== uniqueNames.length) {
    const foundNames = new Set(found.map((r) => r.name));
    const missing = uniqueNames.filter((n) => !foundNames.has(n));
    throw new AppError(400, `Vai trò không tồn tại: ${missing.join(", ")}`);
  }
}

router.get("/", authenticate, async (_req, res, next) => {
  try {
    const workflows = await prisma.workflow.findMany({
      orderBy: { name: "asc" },
      include: WORKFLOW_INCLUDE,
    });
    res.json(workflows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: WORKFLOW_INCLUDE,
    });
    if (!workflow) throw new AppError(404, "Không tìm thấy luồng duyệt");
    res.json(workflow);
  } catch (err) {
    next(err);
  }
});

router.post("/", authenticate, authorize("workflow:manage"), async (req, res, next) => {
  try {
    const parsed = createWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    const { name, description, steps } = parsed.data;

    const existing = await prisma.workflow.findFirst({ where: { name } });
    if (existing) throw new AppError(409, "Tên loại văn bản đã tồn tại");

    await assertRolesExist(steps);

    const workflow = await prisma.workflow.create({
      data: {
        name,
        description,
        steps: {
          create: steps.map((approverRole, i) => ({ stepOrder: i + 1, approverRole })),
        },
      },
      include: WORKFLOW_INCLUDE,
    });
    audit({ req, category: "WORKFLOW", action: "WORKFLOW_CREATE", targetType: "workflow", targetId: workflow.id, detail: workflow.name });
    res.status(201).json(workflow);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", authenticate, authorize("workflow:manage"), async (req, res, next) => {
  try {
    const parsed = updateWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    const { description, steps } = parsed.data;

    const existing = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, "Không tìm thấy luồng duyệt");

    if (steps) await assertRolesExist(steps);

    await prisma.$transaction(async (tx) => {
      if (description !== undefined) {
        await tx.workflow.update({ where: { id: req.params.id }, data: { description } });
      }
      if (steps) {
        await tx.workflowStep.deleteMany({ where: { workflowId: req.params.id } });
        await tx.workflowStep.createMany({
          data: steps.map((approverRole, i) => ({
            workflowId: req.params.id,
            stepOrder: i + 1,
            approverRole,
          })),
        });
      }
    });

    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: WORKFLOW_INCLUDE,
    });
    audit({ req, category: "WORKFLOW", action: "WORKFLOW_UPDATE", targetType: "workflow", targetId: req.params.id, detail: workflow?.name });
    res.json(workflow);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", authenticate, authorize("workflow:manage"), async (req, res, next) => {
  try {
    const existing = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    await prisma.workflow.delete({ where: { id: req.params.id } });
    audit({ req, category: "WORKFLOW", action: "WORKFLOW_DELETE", targetType: "workflow", targetId: req.params.id, detail: existing?.name });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      next(new AppError(404, "Không tìm thấy luồng duyệt"));
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      next(new AppError(409, "Không thể xoá: đã có văn bản dùng luồng duyệt này"));
      return;
    }
    next(err);
  }
});

export default router;
