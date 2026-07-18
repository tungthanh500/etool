// Nhãn tiếng Việt phía backend — hiện dùng cho file Excel xuất ra (mục 3.3).
// Giữ đồng bộ với frontend/src/lib/labels.ts; fallback về mã thô nếu không khớp
// (vd. loại văn bản do Admin tự đặt tên qua Workflow builder).

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
  CHANGES_REQUESTED: "Yêu cầu chỉnh sửa",
  WITHDRAWN: "Đã thu hồi",
};

const TYPE_LABELS: Record<string, string> = {
  GENERAL: "Văn bản chung",
  PURCHASE: "Đơn hàng",
  PAYMENT: "Đề xuất thanh toán",
  LEAVE: "Đơn xin nghỉ phép",
};

export function statusLabelVN(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function typeLabelVN(type: string): string {
  return TYPE_LABELS[type] ?? type;
}
