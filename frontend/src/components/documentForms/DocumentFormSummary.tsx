import { LEAVE_TYPE_LABELS } from "../../lib/labels";

interface DocumentFormSummaryProps {
  type: string;
  formData: unknown;
}

interface LeaveData {
  tuNgay?: string;
  denNgay?: string;
  loaiNghi?: string;
  lyDo?: string;
  soNgay?: number;
}
interface PaymentItemData {
  noiDung: string;
  congTyXuatHoaDon?: string;
  soHoaDon?: string;
  soTien: number;
}
interface PaymentData {
  tenDuAn?: string;
  items?: PaymentItemData[];
  tongTien?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Renderer trang chi tiết theo loại (mục 5.1) — thay bảng key-value chung của R22 cho
// LEAVE/PAYMENT/GENERAL/PURCHASE; loại tuỳ biến khác (Admin tự tạo qua Workflow Builder)
// vẫn fallback về bảng key-value cũ.
export function DocumentFormSummary({ type, formData }: DocumentFormSummaryProps) {
  if (!isRecord(formData)) return null;

  if (type === "LEAVE") {
    const d = formData as LeaveData;
    return (
      <table className="table">
        <tbody>
          <tr>
            <th scope="row" style={{ width: "35%", textAlign: "left" }}>Từ ngày</th>
            <td>{d.tuNgay}</td>
          </tr>
          <tr>
            <th scope="row" style={{ textAlign: "left" }}>Đi làm lại ngày</th>
            <td>{d.denNgay}</td>
          </tr>
          <tr>
            <th scope="row" style={{ textAlign: "left" }}>Số ngày nghỉ</th>
            <td>{d.soNgay}</td>
          </tr>
          <tr>
            <th scope="row" style={{ textAlign: "left" }}>Loại nghỉ</th>
            <td>{LEAVE_TYPE_LABELS[d.loaiNghi ?? ""] ?? d.loaiNghi}</td>
          </tr>
          {d.lyDo && (
            <tr>
              <th scope="row" style={{ textAlign: "left" }}>Lý do</th>
              <td>{d.lyDo}</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  if (type === "PAYMENT") {
    const d = formData as PaymentData;
    return (
      <div>
        <p style={{ marginTop: 0 }}>
          <strong>Tên dự án:</strong> {d.tenDuAn}
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nội dung</th>
                <th>Công ty xuất hoá đơn</th>
                <th>Số hoá đơn</th>
                <th style={{ textAlign: "right" }}>Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {(d.items ?? []).map((it, i) => (
                <tr key={i}>
                  <td>{it.noiDung}</td>
                  <td>{it.congTyXuatHoaDon || "—"}</td>
                  <td>{it.soHoaDon || "—"}</td>
                  <td style={{ textAlign: "right" }}>{it.soTien.toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
          <span style={{ color: "var(--text-muted)" }}>Tổng cộng:</span>
          <strong style={{ fontSize: "var(--fs-lg)" }}>{(d.tongTien ?? 0).toLocaleString("vi-VN")} đ</strong>
        </div>
      </div>
    );
  }

  if (type === "GENERAL" || type === "PURCHASE") {
    const ghiChu = (formData as { ghiChu?: string }).ghiChu;
    if (!ghiChu) return null;
    return <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{ghiChu}</p>;
  }

  // Loại tuỳ biến ngoài 4 loại chuẩn — fallback bảng key-value (hành vi R22 cũ).
  const entries = Object.entries(formData);
  if (entries.length === 0) return null;
  return (
    <table className="table">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <th scope="row" style={{ width: "35%", textAlign: "left" }}>
              {key}
            </th>
            <td>
              {typeof value === "object" && value !== null
                ? JSON.stringify(value)
                : typeof value === "number"
                  ? value.toLocaleString("vi-VN")
                  : String(value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Có nội dung đáng hiện không — dùng để quyết định có render Card bọc ngoài hay không.
export function hasFormSummaryContent(type: string, formData: unknown): boolean {
  if (type === "LEAVE" || type === "PAYMENT") return true;
  if (!isRecord(formData)) return false;
  return Object.values(formData).some((v) => v !== undefined && v !== null && v !== "");
}
