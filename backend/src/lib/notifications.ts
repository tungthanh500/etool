import type { Document, DocumentLog, WorkflowStep } from "@prisma/client";
import { prisma } from "./prisma";
import { notifyUsers } from "./ws";
import { sendPushToUsers } from "./push";
import { getStepApproverIds } from "./workflow";

type NotifiableDocument = Document & {
  creator: { departmentId: string };
  workflow: { steps: WorkflowStep[] };
  logs: DocumentLog[];
};

// userId các người duyệt ứng viên ở bước hiện tại của hồ sơ (mô hình vị trí trong luồng,
// mục 5.6), cộng cả người đang NHẬN uỷ quyền hiệu lực từ họ (mục 4.1) — người duyệt thay
// cũng cần được báo, nếu không thông báo chỉ tới người đang vắng mặt.
export async function getCurrentStepApproverIds(
  document: Pick<NotifiableDocument, "status" | "currentStep" | "creator" | "workflow">,
): Promise<string[]> {
  if (document.status !== "PENDING") return [];
  const step = document.workflow.steps.find((s) => s.stepOrder === document.currentStep);
  if (!step) return [];

  const ids = await getStepApproverIds(step, document.creator.departmentId);
  if (ids.length === 0) return ids;

  const now = new Date();
  const delegations = await prisma.delegation.findMany({
    where: {
      fromUserId: { in: ids },
      startDate: { lte: now },
      endDate: { gte: now },
      toUser: { isActive: true },
    },
    select: { toUserId: true },
  });
  return [...new Set([...ids, ...delegations.map((d) => d.toUserId)])];
}

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

  for (const id of await getCurrentStepApproverIds(document)) {
    ids.add(id);
  }

  ids.delete(excludeUserId);
  return [...ids];
}

// Gộp cả 3 kênh thông báo vào 1 điểm gọi: bảng Notification (hộp thông báo trong app —
// bền, không lỡ), WS (toast cho tab đang mở), Web Push (khi đã đóng tab, cần HTTPS).
// Ghi DB TRƯỚC rồi mới bắn WS — client nhận WS sẽ refetch hộp thông báo và phải thấy bản ghi.
export function notify(userIds: string[], event: Record<string, unknown>): void {
  if (userIds.length === 0) return;
  void (async () => {
    try {
      await prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: String(event.type ?? ""),
          documentId: typeof event.documentId === "string" ? event.documentId : null,
          title: String(event.title ?? ""),
          actorName: typeof event.actorName === "string" ? event.actorName : null,
        })),
      });
    } catch (err) {
      // Hộp thông báo lỗi không được chặn 2 kênh còn lại.
      console.error("Lỗi ghi Notification:", err);
    }
    notifyUsers(userIds, event);
    void sendPushToUsers(userIds, event);
  })();
}
