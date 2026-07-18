import { useEffect, useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";
import { Field, Textarea } from "./Field";

interface ModalProps {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;

  // Giữ onClose trong ref để effect focus-trap bên dưới KHÔNG phụ thuộc identity của nó.
  // Caller thường truyền inline arrow (mới sau mỗi render) — nếu để onClose trong deps,
  // mỗi ký tự gõ vào input trong modal (state ở trang cha → re-render) làm effect chạy lại:
  // cleanup trả focus ra nút mở modal bên ngoài, rồi effect kéo focus về nút X — chính là
  // bug "đang gõ thì nhảy sang nút đóng" ở trang Phòng ban.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Nhớ phần tử đang focus trước khi mở, để trả lại khi đóng. Phải đọc trong lúc render
  // (không phải trong effect) vì React áp dụng autoFocus của con (vd. Textarea) ngay khi
  // commit — nếu đọc trong useEffect thì đã quá trễ, activeElement lúc đó đã là chính modal.
  const wasOpenRef = useRef(false);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  if (open && !wasOpenRef.current) {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return;

    function focusable(): HTMLElement[] {
      return Array.from(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Bẫy focus trong modal: Tab/Shift+Tab quay vòng giữa phần tử đầu-cuối.
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    // React áp dụng autoFocus (vd. Textarea của PromptDialog) trước khi effect này chạy —
    // chỉ tự đưa focus vào phần tử đầu tiên nếu chưa có gì trong modal được focus.
    if (!cardRef.current?.contains(document.activeElement)) {
      (focusable()[0] ?? cardRef.current)?.focus();
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocusedRef.current?.focus?.();
    };
    // Chỉ phụ thuộc open — cleanup (trả focus về chỗ cũ) chỉ chạy đúng lúc modal đóng.
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        ref={cardRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="modal__header">
            <span className="modal__title" id={titleId}>
              {title}
            </span>
            <button className="modal__close" onClick={onClose} aria-label="Đóng">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* --------- ConfirmDialog: xác nhận có/không --------- */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}

/* --------- PromptDialog: nhập lý do (thay window.prompt) --------- */
interface PromptDialogProps {
  open: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  /** Nội dung mô tả thêm phía trên ô nhập (vd. cảnh báo hành động không hoàn tác). */
  message?: ReactNode;
  /** true = cho phép gửi khi bỏ trống (vd. ý kiến khi Duyệt là tuỳ chọn). */
  optional?: boolean;
  confirmLabel?: string;
  confirmTone?: "primary" | "danger" | "orange" | "success";
  loading?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  open,
  title,
  label = "Lý do",
  placeholder,
  message,
  optional = false,
  confirmLabel = "Gửi",
  confirmTone = "primary",
  loading = false,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  // Reset khi đóng/mở lại.
  useEffect(() => {
    if (open) {
      setValue("");
      setTouched(false);
    }
  }, [open]);

  const invalid = !optional && touched && value.trim().length === 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!optional && value.trim().length === 0) return;
    onSubmit(value.trim());
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Huỷ
          </Button>
          <Button variant={confirmTone} onClick={handleSubmit} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {message && <p style={{ marginTop: 0 }}>{message}</p>}
        <Field label={label} error={invalid ? "Vui lòng nhập nội dung" : null}>
          <Textarea
            rows={3}
            value={value}
            placeholder={placeholder}
            invalid={invalid}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
