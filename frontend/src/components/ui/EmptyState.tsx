import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, desc, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__icon">{icon}</div>}
      <div className="empty-state__title">{title}</div>
      {desc && <div className="empty-state__desc">{desc}</div>}
      {action && <div style={{ marginTop: "var(--sp-2)" }}>{action}</div>}
    </div>
  );
}
