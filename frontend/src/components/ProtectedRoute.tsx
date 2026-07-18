import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loading">Đang tải...</div>;
  if (!user) return <Navigate to="/login" replace />;

  // Mật khẩu do Admin cấp/reset — ép đổi trước khi vào bất kỳ trang nào khác (mục 1.2).
  if (user.mustChangePassword && location.pathname !== "/account") {
    return <Navigate to="/account?force=1" replace />;
  }

  return <>{children}</>;
}
