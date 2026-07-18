import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { UPLOAD_DIR } from "./upload";
import { formatDateTimeVN } from "./dateUtils";

const FONTS_DIR = path.join(__dirname, "..", "..", "assets", "fonts");
// Đọc 1 lần lúc module load, dùng lại cho mọi lần đóng dấu — tránh đọc đĩa lặp lại.
const REGULAR_FONT_BYTES = fs.readFileSync(path.join(FONTS_DIR, "DejaVuSans.ttf"));
const BOLD_FONT_BYTES = fs.readFileSync(path.join(FONTS_DIR, "DejaVuSans-Bold.ttf"));

export interface ApproverInfo {
  fullName: string;
  roleName: string;
  approvedAt: Date;
  signatureUrl: string | null;
}

export interface StampInput {
  docNo: string | null;
  approvers: ApproverInfo[]; // theo đúng thứ tự đã duyệt; phần tử cuối là người duyệt cuối
}

const STAMP_RED = rgb(0.75, 0.1, 0.1);
const TEXT_GRAY = rgb(0.25, 0.25, 0.25);

// roleName trong ApproverInfo là Role.name thô từ DB ("Dept_Head"...) — dịch sang
// tiếng Việt khi vẽ lên PDF, mirror ROLE_LABELS phía frontend (lib/labels.ts).
const ROLE_LABELS_VN: Record<string, string> = {
  Staff: "Nhân viên",
  Dept_Head: "Trưởng phòng",
  Director: "Giám đốc",
  Accountant: "Kế toán",
  Admin: "Quản trị hệ thống",
};
function roleLabelVN(role: string): string {
  return ROLE_LABELS_VN[role] ?? role;
}

function embedSignatureImage(pdfDoc: PDFDocument, signatureUrl: string) {
  const filePath = path.join(UPLOAD_DIR, signatureUrl);
  if (!fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  const ext = path.extname(signatureUrl).toLowerCase();
  if (ext === ".png") return pdfDoc.embedPng(bytes);
  if (ext === ".jpg" || ext === ".jpeg") return pdfDoc.embedJpg(bytes);
  return null;
}

// Đóng dấu "ĐÃ PHÊ DUYỆT" trên MỘT TRANG BÌA riêng chèn ở đầu tài liệu, cộng thêm
// trang phụ lục chữ ký ở cuối. Cả 2 đều KHÔNG vẽ đè lên trang nội dung gốc — lúc
// đầu định vẽ dấu trực tiếp lên góc trang 1 có sẵn, nhưng test thực tế phát hiện
// chữ dấu chồng lên chữ nội dung gốc (không biết trước bố cục/nội dung PDF người
// dùng upload để né chỗ trống). Trang bìa/phụ lục riêng là cách an toàn tuyệt đối.
export async function stampApprovedPdf(pdfBytes: Buffer, input: StampInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(REGULAR_FONT_BYTES);
  const boldFont = await pdfDoc.embedFont(BOLD_FONT_BYTES);

  const finalApprover = input.approvers[input.approvers.length - 1];
  const originalFirstPage = pdfDoc.getPages()[0];
  const pageSize: [number, number] = originalFirstPage
    ? [originalFirstPage.getWidth(), originalFirstPage.getHeight()]
    : [595.28, 841.89];

  // --- Trang bìa xác nhận (chèn ở đầu) ---
  if (finalApprover) {
    const coverPage = pdfDoc.insertPage(0, pageSize);
    const [pw, ph] = pageSize;
    const boxW = 260;
    const boxH = 90;
    const x = (pw - boxW) / 2;
    const y = ph - boxH - 120;

    coverPage.drawRectangle({
      x,
      y,
      width: boxW,
      height: boxH,
      borderColor: STAMP_RED,
      borderWidth: 2,
    });
    coverPage.drawText("ĐÃ PHÊ DUYỆT", {
      x: x + 16,
      y: y + boxH - 26,
      size: 16,
      font: boldFont,
      color: STAMP_RED,
    });
    let line = y + boxH - 46;
    if (input.docNo) {
      coverPage.drawText(`Số văn bản: ${input.docNo}`, { x: x + 16, y: line, size: 10, font, color: TEXT_GRAY });
      line -= 16;
    }
    coverPage.drawText(`Người duyệt cuối: ${finalApprover.fullName} (${roleLabelVN(finalApprover.roleName)})`, {
      x: x + 16,
      y: line,
      size: 10,
      font,
      color: TEXT_GRAY,
    });
    line -= 16;
    coverPage.drawText(`Thời điểm: ${formatDateTimeVN(finalApprover.approvedAt)}`, {
      x: x + 16,
      y: line,
      size: 10,
      font,
      color: TEXT_GRAY,
    });
  }

  // --- Trang phụ lục chữ ký ---
  const appendix = pdfDoc.addPage(pageSize);
  const margin = 48;
  let cursorY = pageSize[1] - margin;

  appendix.drawText("PHỤ LỤC CHỮ KÝ", {
    x: margin,
    y: cursorY,
    size: 15,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  cursorY -= 20;
  if (input.docNo) {
    appendix.drawText(`Văn bản: ${input.docNo}`, { x: margin, y: cursorY, size: 10, font, color: TEXT_GRAY });
    cursorY -= 28;
  } else {
    cursorY -= 12;
  }

  const ROW_HEIGHT = 90;
  const SIG_W = 130;
  const SIG_H = 50;

  for (const approver of input.approvers) {
    if (cursorY - ROW_HEIGHT < margin) {
      cursorY = pageSize[1] - margin;
      pdfDoc.addPage(pageSize);
    }
    const page = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];

    let signatureDrawn = false;
    if (approver.signatureUrl) {
      try {
        const embedded = await embedSignatureImage(pdfDoc, approver.signatureUrl);
        if (embedded) {
          const scale = Math.min(SIG_W / embedded.width, SIG_H / embedded.height, 1);
          page.drawImage(embedded, {
            x: margin,
            y: cursorY - SIG_H,
            width: embedded.width * scale,
            height: embedded.height * scale,
          });
          signatureDrawn = true;
        }
      } catch (err) {
        console.error(`Không nhúng được ảnh chữ ký ${approver.signatureUrl}:`, err);
      }
    }
    if (!signatureDrawn) {
      page.drawRectangle({
        x: margin,
        y: cursorY - SIG_H,
        width: SIG_W,
        height: SIG_H,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 1,
      });
      page.drawText("(Chưa có chữ ký mẫu)", {
        x: margin + 8,
        y: cursorY - SIG_H / 2 - 4,
        size: 8,
        font,
        color: rgb(0.6, 0.6, 0.6),
      });
    }

    const textX = margin + SIG_W + 16;
    page.drawText(approver.fullName, {
      x: textX,
      y: cursorY - 14,
      size: 11,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    page.drawText(roleLabelVN(approver.roleName), {
      x: textX,
      y: cursorY - 30,
      size: 9,
      font,
      color: TEXT_GRAY,
    });
    page.drawText(`Duyệt lúc: ${formatDateTimeVN(approver.approvedAt)}`, {
      x: textX,
      y: cursorY - 44,
      size: 9,
      font,
      color: TEXT_GRAY,
    });

    cursorY -= ROW_HEIGHT;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
