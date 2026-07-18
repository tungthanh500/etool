import { LeaveForm } from "./LeaveForm";
import { PaymentForm } from "./PaymentForm";
import { SimpleNoteForm } from "./SimpleNoteForm";
import type { LeaveFormValue, NoteFormValue, PaymentFormValue } from "../../lib/documentFormMeta";

interface DocumentFormFieldsProps {
  type: string;
  title: string;
  onTitleChange: (title: string) => void;
  formData: unknown;
  onFormDataChange: (value: unknown) => void;
}

// Dispatcher theo loại văn bản (mục 5.1) — dùng chung cho cả trang Tạo văn bản và panel
// Chỉnh sửa khi bị yêu cầu chỉnh sửa (DocumentDetailPage), tránh 2 nơi định nghĩa form.
export function DocumentFormFields({ type, title, onTitleChange, formData, onFormDataChange }: DocumentFormFieldsProps) {
  if (type === "LEAVE") {
    return <LeaveForm value={formData as LeaveFormValue} onChange={onFormDataChange} />;
  }
  if (type === "PAYMENT") {
    return <PaymentForm value={formData as PaymentFormValue} onChange={onFormDataChange} />;
  }
  if (type === "PURCHASE") {
    return (
      <SimpleNoteForm
        value={formData as NoteFormValue}
        onChange={onFormDataChange}
        title={title}
        onTitleChange={onTitleChange}
        noteLabel="Ghi chú"
        noteHint="Không bắt buộc"
        notePlaceholder="Ghi chú thêm cho đơn hàng (nếu có)"
      />
    );
  }
  // GENERAL + loại tuỳ biến khác (Admin tự tạo qua Workflow Builder, ngoài 4 loại chuẩn).
  return (
    <SimpleNoteForm
      value={formData as NoteFormValue}
      onChange={onFormDataChange}
      title={title}
      onTitleChange={onTitleChange}
      noteLabel="Tóm tắt / ghi chú"
      noteHint="Không bắt buộc — tóm tắt nội dung hoặc ghi chú về file đính kèm"
      notePlaceholder="Tóm tắt nội dung văn bản..."
    />
  );
}
