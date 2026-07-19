import { ShieldOff } from "lucide-react";
import { EmptyState } from "./EmptyState";

// Trạng thái "không đủ quyền" dùng chung cho các trang bị gate permission (vd. /audit) —
// tránh việc trang hiện nhầm empty-state "chưa có dữ liệu" khi API trả 403 (R32).
export function ForbiddenState() {
  return (
    <div className="card">
      <EmptyState
        icon={<ShieldOff size={26} />}
        title="Không đủ quyền truy cập"
        desc="Liên hệ quản trị viên nếu bạn cần quyền xem trang này."
      />
    </div>
  );
}
