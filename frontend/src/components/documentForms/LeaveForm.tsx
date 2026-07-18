import { Field, Input, Select, Textarea, Alert } from "../ui";
import { previewLeaveDays } from "../../lib/documentFormMeta";
import type { LeaveFormValue } from "../../lib/documentFormMeta";
import { LEAVE_TYPE_LABELS } from "../../lib/labels";

interface LeaveFormProps {
  value: LeaveFormValue;
  onChange: (value: LeaveFormValue) => void;
}

// Đơn xin nghỉ phép (mục 5.2): không có ô "Tiêu đề" (tự sinh ở backend từ họ tên + khoảng
// ngày) và không có upload file (hệ thống tự sinh PDF khi nộp — xem lib/leavePdf.ts).
export function LeaveForm({ value, onChange }: LeaveFormProps) {
  const preview = previewLeaveDays(value.tuNgay, value.denNgay);

  return (
    <div className="form-stack">
      <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <Field label="Từ ngày">
          <Input
            type="date"
            value={value.tuNgay}
            onChange={(e) => onChange({ ...value, tuNgay: e.target.value })}
            required
          />
        </Field>
        <Field label="Đi làm lại ngày">
          <Input
            type="date"
            value={value.denNgay}
            onChange={(e) => onChange({ ...value, denNgay: e.target.value })}
            required
          />
        </Field>
      </div>

      {preview && (
        "error" in preview ? (
          <Alert tone="danger">{preview.error}</Alert>
        ) : (
          <Alert tone="info">
            Số ngày nghỉ: <strong>{preview.days}</strong> ngày
          </Alert>
        )
      )}

      <Field label="Loại nghỉ">
        <Select
          value={value.loaiNghi}
          onChange={(e) => onChange({ ...value, loaiNghi: e.target.value as LeaveFormValue["loaiNghi"] })}
        >
          {Object.entries(LEAVE_TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Lý do" hint="Không bắt buộc">
        <Textarea
          rows={3}
          value={value.lyDo}
          onChange={(e) => onChange({ ...value, lyDo: e.target.value })}
          placeholder="Lý do xin nghỉ (nếu có)"
        />
      </Field>
    </div>
  );
}
