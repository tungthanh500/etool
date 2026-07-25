import { cloneElement, isValidElement, useId } from "react";
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";

interface FieldProps {
  label?: ReactNode;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}

// Gắn <label> với control thật (không chỉ đứng cạnh) để screen reader đọc được tên field —
// trước đây label và children là 2 sibling độc lập, không có htmlFor/id nên AT bỏ qua hoàn
// toàn. Chỉ tự inject id khi children là ĐÚNG 1 React element (trường hợp phổ biến nhất:
// Input/Select/Textarea/DateInput) — khi children là nhiều phần tử hoặc nội dung tuỳ biến
// (vd. 2 Select cạnh nhau ở WorkflowFormPage), không đoán được nên control nào là "chính",
// giữ nguyên hành vi cũ (không htmlFor) thay vì gắn sai.
export function Field({ label, hint, error, children }: FieldProps) {
  const generatedId = useId();
  const child = isValidElement<{ id?: string }>(children) ? children : null;
  const controlId = child?.props.id ?? generatedId;
  const descId = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;

  const control = child
    ? cloneElement(child, {
        id: controlId,
        "aria-describedby": descId,
        ...(error ? { "aria-invalid": true } : {}),
      } as Record<string, unknown>)
    : children;

  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={child ? controlId : undefined}>
          {label}
        </label>
      )}
      {control}
      {error ? (
        <span className="field__error" id={descId}>
          {error}
        </span>
      ) : (
        hint && (
          <span className="field__hint" id={descId}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  mono?: boolean;
}
export function Input({ invalid, mono, className, ...rest }: InputProps) {
  return (
    <input
      className={[
        "input",
        invalid ? "input--error" : "",
        mono ? "input--mono" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={["select", className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </select>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  mono?: boolean;
}
export function Textarea({ invalid, mono, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={[
        "textarea",
        invalid ? "textarea--error" : "",
        mono ? "input--mono" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
