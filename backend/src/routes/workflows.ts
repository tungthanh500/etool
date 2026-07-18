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
  steps: {
    orderBy: { stepOrder: "asc" as const },
    include: {
      department: { select: { id: true, name: true } },
      approverUser: { select: { id: true, fullName: true } },
    },
  },
};

// Mô hình bước duyệt (mục 5.6): CREATOR_DEPT_HEAD không cần thêm dữ liệu (phòng ban xác
// định động theo từng văn bản); DEPARTMENT bắt buộc chọn phòng ban, user đích danh tuỳ chọn.
const stepInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CREATOR_DEPT_HEAD") }),
  z.object({
    kind: z.literal("DEPARTMENT"),
    departmentId: z.string().min(1, "Thiếu phòng ban"),
    approverUserId: z.string().min(1).optional(),
  }),
]);
type StepInput = z.infer<typeof stepInputSchema>;

const stepsSchema = z.array(stepInputSchema).min(1, "Cần ít nhất 1 bước duyệt");

const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên loại văn bản"),
  description: z.string().trim().optional(),
  steps: stepsSchema,
});

const updateWorkflowSchema = z.object({
  description: z.string().trim().optional(),
  steps: stepsSchema.optional(),
});

// Xác nhận: mọi departmentId trong bước DEPARTMENT phải tồn tại; approverUserId (nếu có)
// phải tồn tại VÀ thuộc ĐÚNG phòng ban đã chọn cho bước đó — chỉ định "Trưởng phòng A"
// vào bước gắn phòng ban B là cấu hình sai, chặn ngay từ lúc lưu thay vì lỗi ngầm lúc duyệt.
async function assertStepsValid(steps: StepInput[]): Promise<void> {
  const deptSteps = steps.filter((s): s is Extract<StepInput, { kind: "DEPARTMENT" }> => s.kind === "DEPARTMENT");
  if (deptSteps.length === 0) return;

  const deptIds = [...new Set(deptSteps.map((s) => s.departmentId))];
  const depts = await prisma.department.findMany({ where: { id: { in: deptIds } } });
  if (depts.length !== deptIds.length) {
    throw new AppError(400, "Phòng ban không tồn tại");
  }

  const userIds = [...new Set(deptSteps.map((s) => s.approverUserId).filter((v): v is string => Boolean(v)))];
  if (userIds.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, departmentId: true },
  });
  if (users.length !== userIds.length) {
    throw new AppError(400, "Người duyệt chỉ định không tồn tại");
  }
  const userDept = new Map(users.map((u) => [u.id, u.departmentId]));
  for (const s of deptSteps) {
    if (s.approverUserId && userDept.get(s.approverUserId) !== s.departmentId) {
      throw new AppError(400, "Người duyệt chỉ định phải thuộc đúng phòng ban đã chọn cho bước đó");
    }
  }
}

function stepCreateData(steps: StepInput[]) {
  return steps.map((s, i) => ({
    stepOrder: i + 1,
    kind: s.kind,
    departmentId: s.kind === "DEPARTMENT" ? s.departmentId : null,
    approverUserId: s.kind === "DEPARTMENT" ? (s.approverUserId ?? null) : null,
  }));
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

    await assertStepsValid(steps);

    const workflow = await prisma.workflow.create({
      data: {
        name,
        description,
        steps: { create: stepCreateData(steps) },
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

    if (steps) {
      // R20: sửa các bước khi đang có văn bản chờ duyệt dùng luồng này rất dễ khiến
      // currentStep của hồ sơ đang dở trỏ vào 1 bước đã đổi ý nghĩa/không còn tồn tại
      // giữa chừng — chặn hẳn, chỉ cho sửa mô tả trong lúc đó.
      const pendingCount = await prisma.document.count({
        where: { workflowId: req.params.id, status: "PENDING" },
      });
      if (pendingCount > 0) {
        throw new AppError(409, "Không thể sửa các bước: đang có văn bản chờ duyệt dùng luồng này");
      }
      await assertStepsValid(steps);
    }

    await prisma.$transaction(async (tx) => {
      if (description !== undefined) {
        await tx.workflow.update({ where: { id: req.params.id }, data: { description } });
      }
      if (steps) {
        await tx.workflowStep.deleteMany({ where: { workflowId: req.params.id } });
        await tx.workflowStep.createMany({
          data: stepCreateData(steps).map((s) => ({ ...s, workflowId: req.params.id })),
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
