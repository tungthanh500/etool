import cron from "node-cron";
import { prisma } from "./prisma";
import { dayStartVN, todayVN } from "./dateUtils";
import { getCurrentStepApproverIds, notify } from "./notifications";

// Mặc định: nhắc hồ sơ PENDING không có chuyển động (updatedAt) quá 3 ngày, chạy 08:00 GMT+7.
// Cả hai đều override được qua env — đặc biệt hữu ích khi dev (N=0 + cron mỗi phút).
const DEFAULT_AFTER_DAYS = 3;
const DEFAULT_CRON = "0 8 * * *";

function reminderAfterDays(): number {
  const raw = process.env.REMIND_PENDING_AFTER_DAYS;
  if (raw === undefined || raw === "") return DEFAULT_AFTER_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(`REMIND_PENDING_AFTER_DAYS="${raw}" không hợp lệ — dùng mặc định ${DEFAULT_AFTER_DAYS}`);
    return DEFAULT_AFTER_DAYS;
  }
  return parsed;
}

// Tìm hồ sơ PENDING quá hạn chưa nhắc hôm nay (theo lịch GMT+7), báo cho người duyệt
// bước hiện tại (kể cả người nhận uỷ quyền) qua WS + Web Push. Export riêng để gọi tay được.
export async function remindOverduePendingDocuments(): Promise<number> {
  const afterDays = reminderAfterDays();
  const threshold = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000);
  const todayStart = dayStartVN(todayVN());

  const documents = await prisma.document.findMany({
    where: {
      status: "PENDING",
      updatedAt: { lt: threshold },
      // Chống spam: mỗi hồ sơ nhắc tối đa 1 lần/ngày (ngày tính theo GMT+7).
      OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: todayStart } }],
    },
    include: {
      creator: { select: { departmentId: true } },
      workflow: { include: { steps: true } },
    },
  });

  let reminded = 0;
  for (const document of documents) {
    const approverIds = await getCurrentStepApproverIds(document);
    if (approverIds.length === 0) continue; // workflow lỗi dữ liệu (không có bước khớp) — bỏ qua, không đánh dấu đã nhắc

    notify(approverIds, {
      type: "document:reminder",
      documentId: document.id,
      title: document.title,
      actorName: "Nhắc hạn",
    });

    // Ghi mốc nhắc nhưng GIỮ NGUYÊN updatedAt (Prisma @updatedAt sẽ tự bump nếu không set
    // tường minh) — bump là reset đồng hồ "quá N ngày", hồ sơ sẽ không được nhắc lại hằng
    // ngày nữa. Guard updatedAt trong where: nếu hồ sơ vừa có người xử lý giữa chừng thì
    // bỏ qua, không ghi đè ngược updatedAt mới bằng giá trị cũ.
    await prisma.document.updateMany({
      where: { id: document.id, updatedAt: document.updatedAt },
      data: { lastRemindedAt: new Date(), updatedAt: document.updatedAt },
    });
    reminded += 1;
  }

  if (reminded > 0) {
    console.log(`[reminder] Đã nhắc ${reminded} hồ sơ PENDING quá hạn ${afterDays} ngày`);
  }
  return reminded;
}

export function initReminderJob(): void {
  let expression = process.env.REMIND_CRON || DEFAULT_CRON;
  if (!cron.validate(expression)) {
    console.warn(`REMIND_CRON="${expression}" không hợp lệ — dùng mặc định "${DEFAULT_CRON}"`);
    expression = DEFAULT_CRON;
  }

  cron.schedule(
    expression,
    async () => {
      try {
        await remindOverduePendingDocuments();
      } catch (err) {
        // Job nền không được phép làm sập server — chỉ log, chờ lượt chạy sau.
        console.error("[reminder] Lỗi khi chạy job nhắc hạn:", err);
      }
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );
  console.log(`[reminder] Job nhắc hạn hồ sơ PENDING đã đặt lịch "${expression}" (GMT+7)`);
}
