// Mục 5.1: cấu hình theo loại văn bản chuẩn — quyết định UI có hiện ô upload file hay
// không, và mặc định formData rỗng khi bắt đầu tạo mới. Loại KHÔNG nằm trong 4 loại chuẩn
// (Admin tự tạo qua Workflow Builder) fallback về "optional" — giữ hành vi cũ (upload tự do).
export type FilePolicy = "hidden" | "optional" | "required";

export const DOC_TYPE_FILE_POLICY: Record<string, FilePolicy> = {
  GENERAL: "optional",
  PURCHASE: "required",
  PAYMENT: "optional",
  LEAVE: "hidden",
};

export function filePolicyFor(type: string): FilePolicy {
  return DOC_TYPE_FILE_POLICY[type] ?? "optional";
}

// LEAVE/PAYMENT tự sinh tiêu đề ở backend (deriveTitle) — ô "Tiêu đề" không hiện cho 2 loại này.
const AUTO_TITLE_TYPES = new Set(["LEAVE", "PAYMENT"]);
export function hasAutoTitle(type: string): boolean {
  return AUTO_TITLE_TYPES.has(type);
}

export type LeaveType = "ANNUAL" | "UNPAID" | "STATE_POLICY";

export interface PaymentItem {
  noiDung: string;
  congTyXuatHoaDon: string;
  soHoaDon: string;
  soTien: string; // giữ dạng chuỗi khi soạn thảo — parse Number lúc submit, tránh NaN khi ô trống
}

export interface PaymentFormValue {
  tenDuAn: string;
  items: PaymentItem[];
}

export interface LeaveFormValue {
  tuNgay: string;
  denNgay: string;
  loaiNghi: LeaveType;
  lyDo: string;
}

export interface NoteFormValue {
  ghiChu: string;
}

export function emptyPaymentItem(): PaymentItem {
  return { noiDung: "", congTyXuatHoaDon: "", soHoaDon: "", soTien: "" };
}

// PaymentForm soạn thảo soTien dạng CHUỖI (tránh NaN khi ô đang trống lúc gõ dở) — trước
// khi gửi lên server phải đổi lại thành number đúng schema backend, đồng thời bỏ dòng
// trống cuối cùng (luôn có sẵn 1 dòng trống để gõ tiếp, không phải dữ liệu thật).
export function serializeFormDataForSubmit(type: string, formData: unknown): unknown {
  if (type === "PAYMENT") {
    const d = formData as PaymentFormValue;
    const items = d.items
      .filter((it) => it.noiDung.trim() !== "" || it.soTien.trim() !== "")
      .map((it) => ({
        noiDung: it.noiDung.trim(),
        ...(it.congTyXuatHoaDon.trim() ? { congTyXuatHoaDon: it.congTyXuatHoaDon.trim() } : {}),
        ...(it.soHoaDon.trim() ? { soHoaDon: it.soHoaDon.trim() } : {}),
        soTien: Number(it.soTien) || 0,
      }));
    return { tenDuAn: d.tenDuAn, items };
  }
  return formData;
}

export function defaultFormValue(type: string): unknown {
  if (type === "PAYMENT") return { tenDuAn: "", items: [emptyPaymentItem()] } satisfies PaymentFormValue;
  if (type === "LEAVE") return { tuNgay: "", denNgay: "", loaiNghi: "ANNUAL", lyDo: "" } satisfies LeaveFormValue;
  return { ghiChu: "" } satisfies NoteFormValue;
}

function parseISODateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Bản sao thuần preview phía client của computeLeaveDays (backend) — KHÔNG throw, trả về
// null khi chưa đủ dữ liệu hoặc không hợp lệ, để UI hiện thông báo nhẹ nhàng thay vì lỗi.
// Server (lib/documentForms.ts) mới là nguồn xác thực cuối cùng, tính lại độc lập lúc submit.
export function previewLeaveDays(tuNgay: string, denNgay: string): { days: number } | { error: string } | null {
  if (!tuNgay || !denNgay) return null;
  if (denNgay < tuNgay) return { error: "Ngày đi làm lại phải sau hoặc bằng ngày bắt đầu nghỉ" };
  const fromDow = parseISODateUTC(tuNgay).getUTCDay();
  if (tuNgay === denNgay) {
    if (fromDow === 0 || fromDow === 6) return { error: "Ngày nghỉ phải là ngày làm việc (Thứ 2 - Thứ 6)" };
    return { days: 0.5 };
  }
  let count = 0;
  const cursor = parseISODateUTC(tuNgay);
  const end = parseISODateUTC(denNgay);
  while (cursor.getTime() < end.getTime()) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (count === 0) return { error: "Khoảng ngày nghỉ không hợp lệ — không có ngày làm việc nào trong khoảng đã chọn" };
  return { days: count };
}
