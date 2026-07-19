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

// --- Contract cho API preview (POST /api/documents/preview) ---
// Kết quả tính toán TRƯỚC khi submit (số ngày nghỉ, tổng tiền) — vẫn tính ở backend,
// frontend chỉ gọi API và hiển thị, không tự chép lại thuật toán (Fat Server).

export interface LeaveFormPreview {
  kind: "LEAVE";
  days: number | null; // null: thiếu dữ liệu hoặc không hợp lệ
  error?: string; // có khi không hợp lệ (vd. khoảng ngày sai, rơi vào cuối tuần)
}

export interface PaymentFormPreview {
  kind: "PAYMENT";
  tongTien: number;
}

export interface NoneFormPreview {
  kind: "NONE";
}

export type FormPreviewResult = LeaveFormPreview | PaymentFormPreview | NoneFormPreview;

// --- Catalog permission của hệ thống ---
// Nguồn duy nhất cho UI checkbox (trang Vai trò & quyền, frontend) và validate đầu vào
// role (backend). "*" (toàn quyền) xử lý riêng, không nằm trong list.
// LƯU Ý NGHIỆP VỤ: quyền DUYỆT thực tế đến từ vị trí trong luồng duyệt (WorkflowStep),
// không phải từ role — 3 permission "document:approve:*" chỉ điều khiển hiển thị thẻ
// Uỷ quyền/Chữ ký mẫu ở frontend (canApproveAnything), không cấp quyền duyệt hồ sơ.
export const PERMISSION_KEYS = [
  "document:create",
  "document:read:own",
  "document:approve:dept",
  "document:approve:final",
  "document:approve:payment",
  "user:manage",
  "workflow:manage",
  "audit:read",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
