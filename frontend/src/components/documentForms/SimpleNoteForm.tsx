import { Field, Input, Textarea } from "../ui";
import type { NoteFormValue } from "../../lib/documentFormMeta";

interface SimpleNoteFormProps {
  value: NoteFormValue;
  onChange: (value: NoteFormValue) => void;
  title: string;
  onTitleChange: (title: string) => void;
  noteLabel: string;
  noteHint: string;
  notePlaceholder: string;
}

// Dùng chung cho GENERAL ("Văn bản chung") và PURCHASE ("Đơn hàng", mục 5.4) — cả 2 chỉ
// khác nhau ở nhãn/gợi ý của ô ghi chú, cấu trúc dữ liệu hoàn toàn giống nhau ({ghiChu}).
export function SimpleNoteForm({
  value,
  onChange,
  title,
  onTitleChange,
  noteLabel,
  noteHint,
  notePlaceholder,
}: SimpleNoteFormProps) {
  return (
    <div className="form-stack">
      <Field label="Tiêu đề">
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="VD: Đề xuất mua cáp điện cho xưởng A"
          required
          autoFocus
        />
      </Field>

      <Field label={noteLabel} hint={noteHint}>
        <Textarea
          rows={4}
          value={value.ghiChu}
          onChange={(e) => onChange({ ghiChu: e.target.value })}
          placeholder={notePlaceholder}
        />
      </Field>
    </div>
  );
}
