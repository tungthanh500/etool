import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

type AlertTone = "danger" | "warning" | "info";

const ICONS: Record<AlertTone, ReactNode> = {
  danger: <AlertCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

export function Alert({ tone = "danger", children }: { tone?: AlertTone; children: ReactNode }) {
  return (
    <div className={`alert alert--${tone}`} role="alert">
      <span className="alert__icon">{ICONS[tone]}</span>
      <div>{children}</div>
    </div>
  );
}
