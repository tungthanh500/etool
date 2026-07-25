import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { CheckCircle2, Clock, FileText, Inbox, PenSquare, XCircle } from "lucide-react";
import { apiGet, ApiError } from "../api/client";
import { Alert, Badge, Button, Card, PageHeader, PageLoading } from "../components/ui";
import { statusLabel, STATUS_TONES } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import type { DashboardData } from "../types";

// "2026-07" -> "T7/26" cho nhãn trục biểu đồ (gọn, vẫn phân biệt được khi vắt qua năm).
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `T${Number(m)}/${y.slice(2)}`;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: ReactNode;
  tone?: "primary" | "warning" | "success" | "danger" | "neutral";
  onClick?: () => void;
}

function StatCard({ title, value, icon, tone = "neutral", onClick }: StatCardProps) {
  return (
    <div
      className={`stat-card stat-card--${tone} ${onClick ? "is-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__body">
        <div className="stat-card__value">{value}</div>
        <div className="stat-card__title">{title}</div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiGet<DashboardData>("/api/dashboard")
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((err) => {
        // Không xoá `data` cũ nếu load lại lỗi — giữ số liệu cũ hiển thị hơn là màn hình trắng.
        setLoadError(err instanceof ApiError ? err.message : "Không tải được dữ liệu tổng quan");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ tải 1 lần lúc mount
  }, []);

  if (loading) return <PageLoading />;
  if (!data) {
    return (
      <Alert tone="danger">
        {loadError ?? "Không tải được dữ liệu tổng quan"}{" "}
        <Button variant="ghost" size="sm" onClick={load}>
          Thử lại
        </Button>
      </Alert>
    );
  }

  const maxMonthly = Math.max(1, ...data.monthly.map((m) => m.count));

  return (
    <div>
      <PageHeader title="Tổng quan" subtitle={`Xin chào, ${user?.fullName ?? ""}`} />

      {loadError && (
        <Alert tone="warning">
          Số liệu dưới đây có thể chưa mới nhất — lần làm mới gần nhất bị lỗi ({loadError}).{" "}
          <Button variant="ghost" size="sm" onClick={load}>
            Thử lại
          </Button>
        </Alert>
      )}

      <div className="stat-grid">
        <StatCard
          title="Chờ tôi duyệt"
          value={data.pendingForMe}
          icon={<Inbox size={22} />}
          tone="warning"
          onClick={() => navigate("/documents?tab=pending")}
        />
        <StatCard
          title="Văn bản của tôi"
          value={data.myTotal}
          icon={<FileText size={22} />}
          tone="primary"
          onClick={() => navigate("/documents")}
        />
        <StatCard
          title="Đã duyệt"
          value={data.myByStatus.APPROVED ?? 0}
          icon={<CheckCircle2 size={22} />}
          tone="success"
          onClick={() => navigate("/documents?status=APPROVED")}
        />
        <StatCard
          title="Đang chờ duyệt"
          value={data.myByStatus.PENDING ?? 0}
          icon={<Clock size={22} />}
          tone="neutral"
          onClick={() => navigate("/documents?status=PENDING")}
        />
        <StatCard
          title="Cần chỉnh sửa"
          value={data.myByStatus.CHANGES_REQUESTED ?? 0}
          icon={<PenSquare size={22} />}
          tone="warning"
          onClick={() => navigate("/documents?status=CHANGES_REQUESTED")}
        />
        <StatCard
          title="Bị từ chối"
          value={data.myByStatus.REJECTED ?? 0}
          icon={<XCircle size={22} />}
          tone="danger"
          onClick={() => navigate("/documents?status=REJECTED")}
        />
      </div>

      <Card>
        <h3 style={{ marginTop: 0 }}>
          Văn bản {data.isAdmin ? "toàn hệ thống" : "của tôi"} theo tháng
        </h3>
        <div className="bar-chart">
          {data.monthly.map((m) => (
            <div key={m.month} className="bar-chart__col">
              <div className="bar-chart__track">
                <div
                  className="bar-chart__bar"
                  style={{ height: `${(m.count / maxMonthly) * 100}%` }}
                  title={`${m.count} văn bản`}
                >
                  {m.count > 0 && <span className="bar-chart__value">{m.count}</span>}
                </div>
              </div>
              <span className="bar-chart__label">{monthLabel(m.month)}</span>
            </div>
          ))}
        </div>
      </Card>

      {data.isAdmin && (
        <Card>
          <h3 style={{ marginTop: 0 }}>Thống kê toàn hệ thống</h3>

          <div className="dash-section">
            <div className="dash-section__label">Theo trạng thái ({data.allTotal ?? 0} văn bản)</div>
            <div className="dash-badges">
              {Object.entries(data.allByStatus ?? {})
                .filter(([, n]) => n > 0)
                .map(([status, n]) => (
                  <Badge key={status} tone={STATUS_TONES[status] ?? "neutral"}>
                    {statusLabel(status)}: {n}
                  </Badge>
                ))}
              {(data.allTotal ?? 0) === 0 && (
                <span style={{ color: "var(--text-muted)" }}>Chưa có văn bản nào</span>
              )}
            </div>
          </div>

          <div className="dash-section">
            <div className="dash-section__label">Theo phòng ban</div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Phòng ban</th>
                    <th style={{ textAlign: "right" }}>Số văn bản</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.byDepartment ?? []).map((d) => (
                    <tr key={d.department}>
                      <td className="table__primary">{d.department}</td>
                      <td style={{ textAlign: "right" }}>{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
