import type { Document, DocumentLog, WorkflowStep } from "@prisma/client";
import { prisma } from "./prisma";
import { notifyUsers } from "./ws";
import { sendPushToUsers } from "./push";

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

// Gộp cả 2 kênh thông báo (WS cho tab đang mở + Web Push cho khi đã đóng tab)
// vào 1 điểm gọi, tránh phải sửa lặp lại từng nơi trong documents.ts khi thêm kênh mới.
export function notify(userIds: string[], event: Record<string, unknown>): void {
  notifyUsers(userIds, event);
  void sendPushToUsers(userIds, event);
}
