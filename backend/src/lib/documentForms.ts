import { z } from "zod";
import { AppError } from "./errors";
import { LEAVE_TYPES } from "@etool/shared";
import type { FormPreviewResult } from "@etool/shared";

// Re-export contract dùng chung để phần backend còn lại import từ đây như trước.
export { LEAVE_TYPES } from "@etool/shared";
export type { LeaveType } from "@etool/shared";

// Mục 5.1: bỏ ô "Dữ liệu form (JSON — nâng cao)" — mỗi loại văn bản chuẩn (GENERAL/
// PURCHASE/PAYMENT/LEAVE) có schema riêng, validate ở cả POST (tạo) và PATCH (sửa khi
// bị yêu cầu chỉnh sửa). Loại KHÔNG nằm trong 4 loại chuẩn (Admin tự tạo qua Workflow
// Builder, ví dụ flow tuỳ biến nội bộ) vẫn được — fallback nhận object JSON bất kỳ như
// hành vi cũ, không ép phải theo 1 trong 4 schema này.

const generalFormSchema = z.object({
  ghiChu: z.string().trim().max(2000).optional(),
});

// PURCHASE ("Đơn hàng"): người duyệt xem file để quyết định — chỉ cần ghi chú tuỳ chọn.
const purchaseFormSchema = z.object({
  ghiChu: z.string().trim().max(2000).optional(),
});

const paymentItemSchema = z.object({
  noiDung: z.string().trim().min(1, "Thiếu nội dung"),
  congTyXuatHoaDon: z.string().trim().optional(),
  soHoaDon: z.string().trim().optional(),
  soTien: z.number().positive("Số tiền phải lớn hơn 0"),
});
const paymentFormSchema = z.object({
  tenDuAn: z.string().trim().min(1, "Thiếu tên dự án"),
  items: z.array(paymentItemSchema).min(1, "Cần ít nhất 1 dòng chi phí"),
});

const leaveFormSchema = z.object({
  tuNgay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày bắt đầu nghỉ không hợp lệ"),
  denNgay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày đi làm lại không hợp lệ"),
  loaiNghi: z.enum(LEAVE_TYPES),
  lyDo: z.string().trim().max(1000).optional(),
});

function parseISODateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Số ngày nghỉ (đã chốt với người dùng): trừ cả Thứ 7 và Chủ nhật (công ty làm T2-T6).
// [tuNgay, denNgay) nửa-mở — "đi làm lại" là ngày quay lại làm việc, KHÔNG tính là ngày
// nghỉ. tuNgay === denNgay (nghỉ trong ngày) -> 0.5, bắt buộc rơi vào ngày làm việc.
// Server luôn tự tính lại — KHÔNG tin số ngày client gửi lên.
export function computeLeaveDays(fromStr: string, toStr: string): number {
  if (toStr < fromStr) {
    throw new AppError(400, "Ngày đi làm lại phải sau hoặc bằng ngày bắt đầu nghỉ");
  }
  const fromDow = parseISODateUTC(fromStr).getUTCDay();
  if (fromStr === toStr) {
    if (fromDow === 0 || fromDow === 6) {
      throw new AppError(400, "Ngày nghỉ phải là ngày làm việc (Thứ 2 - Thứ 6)");
    }
    return 0.5;
  }
  let count = 0;
  const cursor = parseISODateUTC(fromStr);
  const end = parseISODateUTC(toStr);
  while (cursor.getTime() < end.getTime()) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (count === 0) {
    throw new AppError(400, "Khoảng ngày nghỉ không hợp lệ — không có ngày làm việc nào trong khoảng đã chọn");
  }
  return count;
}

function zodErrorMessage(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Dữ liệu form không hợp lệ";
}

// Validate + tính các trường dẫn xuất (soNgay, tongTien) — LUÔN tính lại ở server,
// không nhận từ client dù client có gửi kèm cũng bị bỏ qua (schema không có field đó).
export function validateDocumentForm(type: string, raw: unknown): object {
  try {
    switch (type) {
      case "GENERAL":
        return generalFormSchema.parse(raw ?? {});
      case "PURCHASE":
        return purchaseFormSchema.parse(raw ?? {});
      case "PAYMENT": {
        const parsed = paymentFormSchema.parse(raw ?? {});
        const tongTien = parsed.items.reduce((sum, i) => sum + i.soTien, 0);
        return { ...parsed, tongTien };
      }
      case "LEAVE": {
        const parsed = leaveFormSchema.parse(raw ?? {});
        const soNgay = computeLeaveDays(parsed.tuNgay, parsed.denNgay);
        return { ...parsed, soNgay };
      }
      default:
        // Loại tuỳ biến ngoài 4 loại chuẩn (Admin tự tạo qua Workflow Builder) — không ép
        // theo schema nào, chỉ cần là 1 JSON object hợp lệ, giữ hành vi linh hoạt cũ.
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          throw new AppError(400, "Dữ liệu form phải là một object JSON");
        }
        return raw as object;
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError(400, zodErrorMessage(err));
    }
    throw err;
  }
}

// Tiêu đề của LEAVE/PAYMENT tự sinh từ formData + người tạo — backend LUÔN ghi đè, bỏ qua
// title client gửi (nếu có) để tránh lệch giữa tiêu đề hiển thị và nội dung form thật.
// GENERAL/PURCHASE/loại tuỳ biến: giữ nguyên tiêu đề người dùng tự gõ (trả về null).
export function deriveTitle(type: string, formData: Record<string, unknown>, creatorFullName: string): string | null {
  if (type === "LEAVE") {
    const from = String(formData.tuNgay ?? "");
    const to = String(formData.denNgay ?? "");
    return `Đơn xin nghỉ phép — ${creatorFullName} (${shortDateVN(from)} → ${shortDateVN(to)})`;
  }
  if (type === "PAYMENT") {
    return `Đề nghị thanh toán — ${String(formData.tenDuAn ?? "")}`;
  }
  return null;
}

// Preview (POST /api/documents/preview) — tính trường dẫn xuất (soNgay/tongTien) TRƯỚC
// khi submit, lúc người dùng còn đang gõ dở nên KHÔNG throw 400 khi thiếu dữ liệu như
// validateDocumentForm (dành cho submit thật); trả về "chưa đủ dữ liệu" bằng days:null.
export function computeFormPreview(type: string, raw: unknown): FormPreviewResult {
  if (type === "LEAVE") {
    const parsed = z.object({ tuNgay: z.string().optional(), denNgay: z.string().optional() }).safeParse(raw);
    const tuNgay = parsed.success ? parsed.data.tuNgay : undefined;
    const denNgay = parsed.success ? parsed.data.denNgay : undefined;
    if (!tuNgay || !denNgay) return { kind: "LEAVE", days: null };
    try {
      return { kind: "LEAVE", days: computeLeaveDays(tuNgay, denNgay) };
    } catch (err) {
      if (err instanceof AppError) return { kind: "LEAVE", days: null, error: err.message };
      throw err;
    }
  }
  if (type === "PAYMENT") {
    const parsed = z
      .object({ items: z.array(z.object({ soTien: z.coerce.number().optional() })).optional() })
      .safeParse(raw);
    const items = parsed.success ? (parsed.data.items ?? []) : [];
    const tongTien = items.reduce((sum, i) => sum + (i.soTien ?? 0), 0);
    return { kind: "PAYMENT", tongTien };
  }
  return { kind: "NONE" };
}

function shortDateVN(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}`;
}
