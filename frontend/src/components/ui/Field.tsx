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

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      {label && <label className="field__label">{label}</label>}
      {children}
      {error ? (
        <span className="field__error">{error}</span>
      ) : (
        hint && <span className="field__hint">{hint}</span>
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
