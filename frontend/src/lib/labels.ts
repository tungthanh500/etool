// Nhãn hiển thị tiếng Việt dùng chung toàn UI — nguồn duy nhất, tránh lặp
// STATUS_LABELS/ACTION_LABELS ở nhiều trang như trước.

export type DocStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "WITHDRAWN";

export type DocType = "GENERAL" | "PURCHASE" | "PAYMENT";

export type LogAction =
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "REQUEST_CHANGE"
  | "EDIT"
  | "WITHDRAW"
  | "COMMENT";

// Tông màu ngữ nghĩa của Badge — khớp token trong index.css.
export type Tone = "success" | "warning" | "danger" | "orange" | "neutral" | "primary";

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
  CHANGES_REQUESTED: "Yêu cầu chỉnh sửa",
  WITHDRAWN: "Đã thu hồi",
};

export const STATUS_TONES: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CHANGES_REQUESTED: "orange",
  WITHDRAWN: "neutral",
};

export const TYPE_LABELS: Record<string, string> = {
  GENERAL: "Văn bản chung",
  PURCHASE: "Mua sắm vật tư",
  PAYMENT: "Đề xuất thanh toán",
};

export const ACTION_LABELS: Record<string, string> = {
  SUBMIT: "Nộp",
  APPROVE: "Duyệt",
  REJECT: "Từ chối",
  REQUEST_CHANGE: "Yêu cầu chỉnh sửa",
  EDIT: "Chỉnh sửa nội dung",
  WITHDRAW: "Thu hồi",
  COMMENT: "Bình luận",
};

export const ACTION_TONES: Record<string, Tone> = {
  SUBMIT: "primary",
  APPROVE: "success",
  REJECT: "danger",
  REQUEST_CHANGE: "orange",
  EDIT: "orange",
  WITHDRAW: "neutral",
  COMMENT: "neutral",
};

// Nhãn vai trò (role) tiếng Việt — dùng cho stepper duyệt & badge.
export const ROLE_LABELS: Record<string, string> = {
  Staff: "Nhân viên",
  Dept_Head: "Trưởng phòng",
  Director: "Giám đốc",
  Accountant: "Kế toán",
};

export const ROLE_TONES: Record<string, Tone> = {
  Staff: "neutral",
  Dept_Head: "primary",
  Director: "orange",
  Accountant: "success",
};

export function roleLabel(r: string): string {
  return ROLE_LABELS[r] ?? r;
}

// Nhãn sự kiện realtime (WebSocket / toast).
export const EVENT_LABELS: Record<string, string> = {
  "document:created": "đã tạo văn bản",
  "document:step_advanced": "đã duyệt, chuyển bước tiếp theo",
  "document:approved": "đã được duyệt xong",
  "document:rejected": "đã bị từ chối",
  "document:changes_requested": "yêu cầu chỉnh sửa",
  "document:resubmitted": "đã nộp lại",
  "document:commented": "đã bình luận",
  "document:withdrawn": "đã thu hồi văn bản",
  "document:reminder": "văn bản chờ duyệt đã quá hạn",
};

export const EVENT_TONES: Record<string, Tone> = {
  "document:created": "primary",
  "document:step_advanced": "primary",
  "document:approved": "success",
  "document:rejected": "danger",
  "document:changes_requested": "orange",
  "document:resubmitted": "primary",
  "document:commented": "neutral",
  "document:withdrawn": "neutral",
  "document:reminder": "orange",
};

// Helper an toàn: trả nhãn nếu có, không thì trả chính key.
export function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}
export function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t;
}
export function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a;
}

// ---- Audit log (nhật ký hệ thống) ----
export const AUDIT_CATEGORY_LABELS: Record<string, string> = {
  AUTH: "Xác thực",
  DOCUMENT: "Hồ sơ",
  USER: "Người dùng",
  WORKFLOW: "Luồng duyệt",
  FILE: "Tệp tin",
};

export const AUDIT_CATEGORY_TONES: Record<string, Tone> = {
  AUTH: "primary",
  DOCUMENT: "success",
  USER: "orange",
  WORKFLOW: "warning",
  FILE: "neutral",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: "Đăng nhập",
  LOGOUT: "Đăng xuất",
  LOGIN_FAILED: "Đăng nhập thất bại",
  SUBMIT: "Nộp hồ sơ",
  APPROVE: "Duyệt",
  REJECT: "Từ chối",
  REQUEST_CHANGE: "Yêu cầu chỉnh sửa",
  EDIT: "Chỉnh sửa nội dung",
  WITHDRAW: "Thu hồi văn bản",
  RESUBMIT: "Nộp lại",
  COMMENT: "Bình luận",
  USER_CREATE: "Tạo user",
  USER_UPDATE: "Sửa user",
  USER_DISABLE: "Vô hiệu hoá user",
  USER_ENABLE: "Mở khoá user",
  PROFILE_UPDATE: "Sửa thông tin cá nhân",
  DELEGATION_CREATE: "Tạo uỷ quyền duyệt",
  DELEGATION_DELETE: "Thu hồi uỷ quyền duyệt",
  DEPT_CREATE: "Tạo phòng ban",
  DEPT_UPDATE: "Sửa phòng ban",
  DEPT_DELETE: "Xoá phòng ban",
  SIGNATURE_SET: "Cập nhật chữ ký mẫu",
  SIGNATURE_CLEAR: "Xoá chữ ký mẫu",
  PASSWORD_CHANGE: "Đổi mật khẩu",
  WORKFLOW_CREATE: "Tạo luồng duyệt",
  WORKFLOW_UPDATE: "Sửa luồng duyệt",
  WORKFLOW_DELETE: "Xoá luồng duyệt",
  FILE_UPLOAD: "Tải file lên",
  FILE_DOWNLOAD: "Tải file xuống",
  FILE_DELETE: "Xoá file",
  EXPORT: "Xuất Excel",
};

export function auditCategoryLabel(c: string): string {
  return AUDIT_CATEGORY_LABELS[c] ?? c;
}
export function auditActionLabel(a: string): string {
  return AUDIT_ACTION_LABELS[a] ?? a;
}
