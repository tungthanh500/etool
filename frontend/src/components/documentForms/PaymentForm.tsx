import { Trash2 } from "lucide-react";
import { Field, Input } from "../ui";
import { emptyPaymentItem } from "../../lib/documentFormMeta";
import type { PaymentFormValue, PaymentItem } from "../../lib/documentFormMeta";

interface PaymentFormProps {
  value: PaymentFormValue;
  onChange: (value: PaymentFormValue) => void;
}

function formatMoney(n: number): string {
  return n.toLocaleString("vi-VN");
}

// Đề nghị thanh toán (mục 5.3): bảng chi phí tự sinh dòng mới khi dòng cuối có nội dung,
// tổng cộng tự tính hiển thị ngay (server tính lại độc lập lúc submit, không tin số này).
export function PaymentForm({ value, onChange }: PaymentFormProps) {
  function updateItem(idx: number, patch: Partial<PaymentItem>) {
    const items = value.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    // Gõ vào dòng cuối cùng mà nó đang trống hoàn toàn -> tự thêm dòng mới phía dưới.
    const last = items[items.length - 1];
    const lastHasContent = last.noiDung || last.congTyXuatHoaDon || last.soHoaDon || last.soTien;
    if (idx === items.length - 1 && lastHasContent) {
      items.push(emptyPaymentItem());
    }
    onChange({ ...value, items });
  }

  function removeItem(idx: number) {
    const items = value.items.filter((_, i) => i !== idx);
    onChange({ ...value, items: items.length > 0 ? items : [emptyPaymentItem()] });
  }

  const total = value.items.reduce((sum, it) => sum + (Number(it.soTien) || 0), 0);

  return (
    <div className="form-stack">
      <Field label="Tên dự án">
        <Input
          value={value.tenDuAn}
          onChange={(e) => onChange({ ...value, tenDuAn: e.target.value })}
          placeholder="VD: Nâng cấp hệ thống mạng văn phòng"
          required
        />
      </Field>

      <Field label="Bảng chi phí">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nội dung</th>
                <th>Công ty xuất hoá đơn</th>
                <th>Số hoá đơn</th>
                <th style={{ textAlign: "right" }}>Số tiền</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {value.items.map((item, i) => (
                <tr key={i}>
                  <td>
                    <Input
                      value={item.noiDung}
                      onChange={(e) => updateItem(i, { noiDung: e.target.value })}
                      placeholder="Nội dung chi phí"
                    />
                  </td>
                  <td>
                    <Input
                      value={item.congTyXuatHoaDon}
                      onChange={(e) => updateItem(i, { congTyXuatHoaDon: e.target.value })}
                      placeholder="Không bắt buộc"
                    />
                  </td>
                  <td>
                    <Input
                      value={item.soHoaDon}
                      onChange={(e) => updateItem(i, { soHoaDon: e.target.value })}
                      placeholder="Không bắt buộc"
                    />
                  </td>
                  <td>
                    <Input
                      type="number"
                      min="0"
                      style={{ textAlign: "right" }}
                      value={item.soTien}
                      onChange={(e) => updateItem(i, { soTien: e.target.value })}
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Xoá dòng"
                      onClick={() => removeItem(i)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Field>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", alignItems: "baseline" }}>
        <span style={{ color: "var(--text-muted)" }}>Tổng cộng:</span>
        <strong style={{ fontSize: "var(--fs-lg)" }}>{formatMoney(total)} đ</strong>
      </div>
    </div>
  );
}
