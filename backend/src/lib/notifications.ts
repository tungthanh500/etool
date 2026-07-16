import type { Document, DocumentLog, WorkflowStep } from "@prisma/client";
import { prisma } from "./prisma";

type NotifiableDocument = Document & {
  creator: { departmentId: string };
  workflow: { steps: WorkflowStep[] };
  logs: DocumentLog[];
};

// Trả về danh sách userId cần báo cho một sự kiện trên document:
// người tạo + ai đã từng thao tác trên hồ sơ (giống tinh thần canViewDocument),
// cộng thêm người duyệt ứng viên ở bước hiện tại nếu hồ sơ còn PENDING.
export async function getNotifiableUserIds(
  document: NotifiableDocument,
  excludeUserId: string,
): Promise<string[]> {
  const ids = new Set<string>();
  ids.add(document.creatorId);
  for (const log of document.logs) {
    ids.add(log.userId);
  }

  if (document.status === "PENDING") {
    const step = document.workflow.steps.find((s) => s.stepOrder === document.currentStep);
    if (step) {
      const candidates = await prisma.user.findMany({
        where: {
          role: { name: step.approverRole },
          ...(step.approverRole === "Dept_Head" ? { departmentId: document.creator.departmentId } : {}),
        },
        select: { id: true },
      });
      for (const c of candidates) {
        ids.add(c.id);
      }
    }
  }

  ids.delete(excludeUserId);
  return [...ids];
}
