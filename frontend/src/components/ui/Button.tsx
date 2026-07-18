import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "orange" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  loading?: boolean;
  block?: boolean;
  iconOnly?: boolean;
  leftIcon?: ReactNode;
  children?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  block = false,
  iconOnly = false,
  leftIcon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn--${variant}`,
    size === "sm" ? "btn--sm" : "",
    block ? "btn--block" : "",
    iconOnly ? "btn--icon-only" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? (
        <span className="spinner" style={{ width: 15, height: 15 }} aria-hidden />
      ) : (
        leftIcon
      )}
      {children}
    </button>
  );
}
