import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
}

export function PageHeader({ title, subtitle, actions, backTo, backLabel }: PageHeaderProps) {
  return (
    <div>
      {backTo && (
        <Link to={backTo} className="back-link">
          <ChevronLeft size={16} />
          {backLabel ?? "Quay lại"}
        </Link>
      )}
      <div className="page-head">
        <div className="page-head__titles">
          <h1>{title}</h1>
          {subtitle && <div className="page-head__sub">{subtitle}</div>}
        </div>
        {actions && <div className="page-head__actions">{actions}</div>}
      </div>
    </div>
  );
}
