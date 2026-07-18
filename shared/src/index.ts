// @etool/shared — HỢP ĐỒNG (contract) dùng chung giữa backend và frontend.
// NGUYÊN TẮC: chỉ chứa KIỂU + HẰNG SỐ. TUYỆT ĐỐI không chứa thuật toán/tính toán —
// mọi phép tính làm ở backend (Fat Server / Thin Client). Frontend chỉ hiển thị.

// --- Enum / union dùng chung (contract giá trị) ---

export const LEAVE_TYPES = ["ANNUAL", "UNPAID", "STATE_POLICY"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const DOCUMENT_STATUSES = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
  "WITHDRAWN",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const WORKFLOW_STEP_KINDS = ["CREATOR_DEPT_HEAD", "DEPARTMENT"] as const;
export type WorkflowStepKind = (typeof WORKFLOW_STEP_KINDS)[number];

// --- Hình dạng formData ĐÃ được backend validate/tính toán (contract wire) ---
// Đây là dữ liệu SAU khi backend xử lý (kèm trường dẫn xuất soNgay/tongTien). KHÔNG phải
// kiểu "đang soạn thảo" phía UI (vd. PaymentForm giữ soTien dạng chuỗi) — kiểu UI đó là
// việc riêng của frontend, không thuộc contract này.

export interface GeneralFormData {
  ghiChu?: string;
}

export interface PurchaseFormData {
  ghiChu?: string;
}

export interface PaymentItemData {
  noiDung: string;
  congTyXuatHoaDon?: string;
  soHoaDon?: string;
  soTien: number;
}

export interface PaymentFormData {
  tenDuAn: string;
  items: PaymentItemData[];
  tongTien: number; // backend tự tính từ items — frontend chỉ hiển thị
}

export interface LeaveFormData {
  tuNgay: string; // YYYY-MM-DD
  denNgay: string; // YYYY-MM-DD
  loaiNghi: LeaveType;
  lyDo?: string;
  soNgay: number; // backend tự tính (computeLeaveDays) — frontend chỉ hiển thị
}
