import { Field, DateInput, Select, Textarea, Alert } from "../ui";
import type { LeaveFormValue } from "../../lib/documentFormMeta";
import { LEAVE_TYPE_LABELS } from "../../lib/labels";
import { useDocumentFormPreview } from "../../hooks/useDocumentFormPreview";

interface LeaveFormProps {
  value: LeaveFormValue;
  onChange: (value: LeaveFormValue) => void;
}

// Đơn xin nghỉ phép (mục 5.2): không có ô "Tiêu đề" (tự sinh ở backend từ họ tên + khoảng
// ngày) và không có upload file (hệ thống tự sinh PDF khi nộp — xem lib/leavePdf.ts).
export function LeaveForm({ value, onChange }: LeaveFormProps) {
  const preview = useDocumentFormPreview(
    "LEAVE",
    { tuNgay: value.tuNgay, denNgay: value.denNgay },
    Boolean(value.tuNgay && value.denNgay),
  );

  return (
    <div className="form-stack">
      <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <Field label="Từ ngày">
          <DateInput
            value={value.tuNgay}
            onChange={(v) => onChange({ ...value, tuNgay: v })}
            required
          />
        </Field>
        <Field label="Đi làm lại ngày">
          <DateInput
            value={value.denNgay}
            onChange={(v) => onChange({ ...value, denNgay: v })}
            required
          />
        </Field>
      </div>

      {preview?.kind === "LEAVE" && (
        preview.error ? (
          <Alert tone="danger">{preview.error}</Alert>
        ) : preview.days !== null ? (
          <Alert tone="info">
            Số ngày nghỉ: <strong>{preview.days}</strong> ngày
          </Alert>
        ) : null
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
