import type { ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Card({ title, actions, children, className, bodyClassName }: CardProps) {
  return (
    <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
      {(title || actions) && (
        <div className="card__header">
          {title && <div className="card__title">{title}</div>}
          {actions}
        </div>
      )}
      <div className={["card__body", bodyClassName ?? ""].filter(Boolean).join(" ")}>
        {children}
      </div>
    </div>
  );
}
