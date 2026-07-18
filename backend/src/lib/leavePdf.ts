import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { DocumentLog, WorkflowStep } from "@prisma/client";
import { UPLOAD_DIR } from "./upload";
import { formatDateTimeVN } from "./dateUtils";
import { describeStep } from "./workflow";

// Mục 5.2: PDF đơn xin nghỉ phép tự sinh — DÙNG CHUNG 1 layout cho cả lúc nộp đơn (khu
// "PHẦN PHÊ DUYỆT" để trống/chờ) lẫn lúc duyệt xong bước cuối (khu đó được điền đầy đủ).
// Khác 2.4/2.5 (GENERAL/PAYMENT/PURCHASE — chèn trang bìa + phụ lục vào file người dùng
// upload): LEAVE không có file gốc do người dùng nộp, nên regenerate LẠI TOÀN BỘ 1 trang,
// không phải chèn thêm trang — đúng yêu cầu "đóng dấu vào cuối trang này", không sinh trang phụ.

const FONTS_DIR = path.join(__dirname, "..", "..", "assets", "fonts");
const REGULAR_FONT_BYTES = fs.readFileSync(path.join(FONTS_DIR, "DejaVuSans.ttf"));
const BOLD_FONT_BYTES = fs.readFileSync(path.join(FONTS_DIR, "DejaVuSans-Bold.ttf"));

const LEAVE_TYPE_LABELS_VN: Record<string, string> = {
  ANNUAL: "Nghỉ phép năm",
  UNPAID: "Nghỉ không lương",
  STATE_POLICY: "Nghỉ theo chính sách nhà nước",
};

const TEXT_BLACK = rgb(0, 0, 0);
const TEXT_GRAY = rgb(0.35, 0.35, 0.35);
const BORDER_GRAY = rgb(0.7, 0.7, 0.7);

export interface LeaveStepRow {
  stepLabel: string;
  skipped?: boolean;
  approver?: {
    fullName: string;
    signatureUrl: string | null;
    approvedAt: Date;
  };
}

export interface LeavePdfInput {
  docNo: string | null;
  fullName: string;
  departmentName: string;
  tuNgay: string; // YYYY-MM-DD
  denNgay: string;
  soNgay: number;
  loaiNghi: string;
  lyDo?: string;
  createdAt: Date;
  requesterSignatureUrl: string | null;
  steps: LeaveStepRow[];
}

function shortDateVN(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function embedImage(pdfDoc: PDFDocument, signatureUrl: string) {
  const filePath = path.join(UPLOAD_DIR, signatureUrl);
  if (!fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  const ext = path.extname(signatureUrl).toLowerCase();
  if (ext === ".png") return pdfDoc.embedPng(bytes);
  if (ext === ".jpg" || ext === ".jpeg") return pdfDoc.embedJpg(bytes);
  return null;
}

// STEP_SKIPPED log ghi lý do dạng text "Bỏ qua bước N — ..." (xem skipReasonText trong
// routes/documents.ts) — không có cột stepOrder riêng, phải đọc lại từ đầu chuỗi comment.
function extractSkippedStepOrder(comment: string | null): number | null {
  if (!comment) return null;
  const m = comment.match(/^Bỏ qua bước (\d+)/);
  return m ? Number(m[1]) : null;
}

type StepWithNames = Pick<WorkflowStep, "stepOrder" | "kind" | "departmentId" | "approverUserId"> & {
  department: { name: string } | null;
  approverUser: { fullName: string } | null;
};
type LogWithUser = Pick<DocumentLog, "action" | "comment" | "createdAt"> & {
  user: { fullName: string; signatureUrl: string | null };
};

// Ghép danh sách bước của workflow với log thật của văn bản (APPROVE/STEP_SKIPPED) theo
// ĐÚNG THỨ TỰ — APPROVE log thứ N khớp với bước "thật" (không bị skip) thứ N, vì
// resolveEffectiveStep() (lib/workflow.ts) luôn duyệt các bước tăng dần stepOrder.
export function buildLeaveStepRows(steps: StepWithNames[], logs: LogWithUser[]): LeaveStepRow[] {
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const approveLogs = logs.filter((l) => l.action === "APPROVE");
  const skippedOrders = new Set(
    logs
      .filter((l) => l.action === "STEP_SKIPPED")
      .map((l) => extractSkippedStepOrder(l.comment))
      .filter((n): n is number => n !== null),
  );

  let approveIdx = 0;
  return sorted.map((step) => {
    const stepLabel = describeStep(step, step.department?.name, step.approverUser?.fullName);
    if (skippedOrders.has(step.stepOrder)) {
      return { stepLabel, skipped: true };
    }
    const log = approveLogs[approveIdx];
    if (log) {
      approveIdx += 1;
      return {
        stepLabel,
        approver: { fullName: log.user.fullName, signatureUrl: log.user.signatureUrl, approvedAt: log.createdAt },
      };
    }
    return { stepLabel };
  });
}

export async function buildLeavePdf(input: LeavePdfInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(REGULAR_FONT_BYTES);
  const boldFont = await pdfDoc.embedFont(BOLD_FONT_BYTES);

  const pageSize: [number, number] = [595.28, 841.89]; // A4
  const [pw] = pageSize;
  const margin = 56;
  let page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;

  function centered(text: string, size: number, useBold = false) {
    const f = useBold ? boldFont : font;
    const width = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (pw - width) / 2, y, size, font: f, color: TEXT_BLACK });
    y -= size + 6;
  }
  function line(text: string, size = 11, useBold = false, color = TEXT_BLACK) {
    page.drawText(text, { x: margin, y, size, font: useBold ? boldFont : font, color });
    y -= size + 10;
  }

  centered("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", 13, true);
  centered("Độc lập - Tự do - Hạnh phúc", 12, true);
  y -= 4;
  centered("--------------", 11);
  y -= 10;
  centered("ĐƠN XIN NGHỈ PHÉP", 18, true);
  if (input.docNo) {
    y += 2;
    centered(`Số: ${input.docNo}`, 10);
  }
  y -= 14;

  line(`Họ và tên: ${input.fullName}`, 12);
  line(`Phòng ban: ${input.departmentName}`, 12);
  line(`Loại nghỉ: ${LEAVE_TYPE_LABELS_VN[input.loaiNghi] ?? input.loaiNghi}`, 12);
  line(`Từ ngày: ${shortDateVN(input.tuNgay)}    Đi làm lại ngày: ${shortDateVN(input.denNgay)}`, 12);
  line(`Số ngày nghỉ: ${input.soNgay} ngày`, 12);
  if (input.lyDo) {
    line(`Lý do: ${input.lyDo}`, 12);
  }
  line(`Ngày làm đơn: ${formatDateTimeVN(input.createdAt)}`, 11, false, TEXT_GRAY);

  y -= 10;

  // Chữ ký người làm đơn — bên phải trang.
  const sigBoxW = 160;
  const sigBoxH = 60;
  const sigX = pw - margin - sigBoxW;
  page.drawText("Người làm đơn", { x: sigX, y, size: 10, font: boldFont, color: TEXT_BLACK });
  y -= sigBoxH + 4;
  let requesterSigDrawn = false;
  if (input.requesterSignatureUrl) {
    try {
      const embedded = await embedImage(pdfDoc, input.requesterSignatureUrl);
      if (embedded) {
        const scale = Math.min(sigBoxW / embedded.width, sigBoxH / embedded.height, 1);
        page.drawImage(embedded, { x: sigX, y, width: embedded.width * scale, height: embedded.height * scale });
        requesterSigDrawn = true;
      }
    } catch (err) {
      console.error("Không nhúng được chữ ký người làm đơn:", err);
    }
  }
  if (!requesterSigDrawn) {
    page.drawText("(Chưa có chữ ký mẫu)", { x: sigX, y: y + sigBoxH / 2, size: 8, font, color: TEXT_GRAY });
  }
  page.drawText(input.fullName, { x: sigX, y: y - 12, size: 10, font: boldFont, color: TEXT_BLACK });
  y -= 30;

  // --- PHẦN PHÊ DUYỆT — luôn ở cuối trang này, không sinh trang phụ ---
  y -= 10;
  page.drawLine({ start: { x: margin, y: y + 8 }, end: { x: pw - margin, y: y + 8 }, thickness: 1, color: BORDER_GRAY });
  y -= 14;
  page.drawText("PHẦN PHÊ DUYỆT", { x: margin, y, size: 13, font: boldFont, color: TEXT_BLACK });
  y -= 24;

  const colW = (pw - margin * 2) / input.steps.length;
  const rowTop = y;
  const boxH = 90;

  input.steps.forEach((step, i) => {
    const x = margin + i * colW;
    page.drawText(step.stepLabel, { x, y: rowTop, size: 9, font: boldFont, color: TEXT_GRAY, maxWidth: colW - 8 });

    if (step.skipped) {
      page.drawText("(Bỏ qua — không cần duyệt)", {
        x,
        y: rowTop - 34,
        size: 9,
        font,
        color: TEXT_GRAY,
        maxWidth: colW - 12,
      });
      return;
    }

    const boxY = rowTop - boxH + 20;
    const boxW = colW - 16;
    if (step.approver) {
      // Ảnh chữ ký (nếu có) vẽ ở vòng lặp for...of riêng bên dưới — embedImage là async,
      // không gọi được trong forEach.
      page.drawText(step.approver.fullName, { x, y: rowTop - 20, size: 10, font: boldFont, color: TEXT_BLACK });
      page.drawText(`Duyệt lúc: ${formatDateTimeVN(step.approver.approvedAt)}`, {
        x,
        y: rowTop - 34,
        size: 8,
        font,
        color: TEXT_GRAY,
        maxWidth: colW - 12,
      });
      page.drawText("ĐÃ DUYỆT", { x, y: boxY - 4, size: 9, font: boldFont, color: rgb(0.1, 0.5, 0.15) });
    } else {
      page.drawRectangle({ x, y: boxY, width: boxW, height: 40, borderColor: BORDER_GRAY, borderWidth: 1 });
      page.drawText("(Chưa duyệt)", { x: x + 8, y: boxY + 16, size: 8, font, color: TEXT_GRAY });
    }
  });

  // Ảnh chữ ký người duyệt phải vẽ async — vòng lặp for...of riêng sau khi đã vẽ text/khung.
  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i];
    if (step.skipped || !step.approver?.signatureUrl) continue;
    const x = margin + i * colW;
    const boxY = rowTop - boxH + 20;
    const boxW = colW - 16;
    try {
      const embedded = await embedImage(pdfDoc, step.approver.signatureUrl);
      if (embedded) {
        const scale = Math.min(boxW / embedded.width, 36 / embedded.height, 1);
        page.drawImage(embedded, { x, y: boxY + 2, width: embedded.width * scale, height: embedded.height * scale });
      }
    } catch (err) {
      console.error(`Không nhúng được chữ ký người duyệt ${step.approver.signatureUrl}:`, err);
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
