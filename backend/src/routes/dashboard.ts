import { Router } from "express";
import type { Document, WorkflowStep } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middlewares/authenticate";
import { buildPendingWorkflowFilter, getActiveDelegators, isCurrentApprover } from "../lib/workflow";
import { lastSixMonthsVN } from "../lib/dateUtils";

const router = Router();

const ALL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED", "WITHDRAWN", "DRAFT"] as const;

type StatusCount = Record<string, number>;

// Chuẩn hoá kết quả groupBy(status) thành object đủ 6 khoá (kể cả status có 0 hồ sơ)
// để frontend không phải tự điền khoá thiếu.
function toStatusMap(groups: { status: string; _count: { _all: number } }[]): StatusCount {
  const map: StatusCount = {};
  for (const s of ALL_STATUSES) map[s] = 0;
  for (const g of groups) map[g.status] = g._count._all;
  return map;
}

// Shape tối thiểu để isCurrentApprover chạy được (status, currentStep, creator.departmentId,
// workflow.steps) — tránh kéo toàn bộ quan hệ khi chỉ cần đếm hàng chờ duyệt.
type PendingCandidate = Document & {
  workflow: { steps: WorkflowStep[] };
  creator: { departmentId: string };
};

router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    // "*" là quyền Admin — chỉ Admin thấy số liệu toàn tổ chức; user thường chỉ thấy của mình.
    const isAdmin = user.role.permissions.includes("*");

    const myGroups = await prisma.document.groupBy({
      by: ["status"],
      where: { creatorId: user.id },
      _count: { _all: true },
    });
    const myByStatus = toStatusMap(myGroups);
    const myTotal = myGroups.reduce((sum, g) => sum + g._count._all, 0);

    // Số hồ sơ đang chờ CHÍNH user này duyệt — lọc thô ở DB theo vị trí trong luồng (gồm
    // cả vị trí của người đang uỷ quyền cho mình, mục 4.1) rồi hậu kiểm isCurrentApprover
    // (đúng bước hiện tại), như route /pending.
    const delegators = await getActiveDelegators(user.id);
    const pendingCandidates = (await prisma.document.findMany({
      where: {
        status: "PENDING",
        workflow: buildPendingWorkflowFilter(user, delegators),
      },
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
        creator: { select: { departmentId: true } },
      },
    })) as PendingCandidate[];
    const pendingForMe = pendingCandidates.filter((d) => isCurrentApprover(d, user, delegators)).length;

    // Biểu đồ 6 tháng: Admin đếm toàn hệ thống, user thường đếm hồ sơ mình tạo.
    const months = lastSixMonthsVN();
    const monthlyScope = isAdmin ? {} : { creatorId: user.id };
    const monthly = await Promise.all(
      months.map(async (m) => ({
        month: m.label,
        count: await prisma.document.count({
          where: { ...monthlyScope, createdAt: { gte: m.gte, lt: m.lt } },
        }),
      })),
    );

    const result: Record<string, unknown> = {
      isAdmin,
      myByStatus,
      myTotal,
      pendingForMe,
      monthly,
    };

    if (isAdmin) {
      const allGroups = await prisma.document.groupBy({ by: ["status"], _count: { _all: true } });
      result.allByStatus = toStatusMap(allGroups);
      result.allTotal = allGroups.reduce((sum, g) => sum + g._count._all, 0);

      const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
      result.byDepartment = await Promise.all(
        departments.map(async (dep) => ({
          department: dep.name,
          count: await prisma.document.count({ where: { creator: { departmentId: dep.id } } }),
        })),
      );
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
