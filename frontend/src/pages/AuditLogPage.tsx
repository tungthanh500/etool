import { useEffect, useState } from "react";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import { apiGet, ApiError } from "../api/client";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  ForbiddenState,
  PageHeader,
  Select,
  SkeletonRows,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { can } from "../lib/permissions";
import {
  auditActionLabel,
  auditCategoryLabel,
  AUDIT_CATEGORY_LABELS,
  AUDIT_CATEGORY_TONES,
} from "../lib/labels";
import { formatDateTime } from "../lib/formatDate";
import type { AuditLog, AuditLogPage as AuditLogPageData } from "../types";

const LIMIT = 50;

export function AuditLogPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Gate client-side chỉ để hiển thị đúng thông báo — backend vẫn là nguồn sự thật
  // (authorize("audit:read") trên /api/audit); 403 giữa phiên cũng bắt ở .catch dưới.
  const allowed = can(user, "audit:read");

  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (category) params.set("category", category);
    apiGet<AuditLogPageData>(`/api/audit?${params.toString()}`)
      .then((data) => {
        setLogs(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
      })
      .finally(() => setLoading(false));
  }, [category, page, allowed]);

  if (!allowed || forbidden) {
    return (
      <div>
        <PageHeader title="Nhật ký hệ thống" />
        <ForbiddenState />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <PageHeader
        title="Nhật ký hệ thống"
        subtitle="Ghi lại đăng nhập, thao tác hồ sơ và mọi hành động quản trị"
        actions={
          <div style={{ minWidth: 200 }}>
            <Field label="Lọc theo nhóm">
              <Select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả nhóm</option>
                {Object.keys(AUDIT_CATEGORY_LABELS).map((c) => (
                  <option key={c} value={c}>
                    {auditCategoryLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        }
      />

      {loading ? (
        <div className="table-wrap">
          <SkeletonRows rows={8} cols={5} />
        </div>
      ) : logs.length === 0 ? (
        <div className="card">
          <EmptyState icon={<ScrollText size={26} />} title="Chưa có nhật ký nào" />
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người thực hiện</th>
                  <th>Nhóm</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td>
                      {log.actor ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
                          <Avatar name={log.actor.fullName} size="sm" />
                          <span className="table__primary">{log.actor.fullName}</span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>{log.actorEmail ?? "—"}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={AUDIT_CATEGORY_TONES[log.category] ?? "neutral"}>
                        {auditCategoryLabel(log.category)}
                      </Badge>
                    </td>
                    <td>{auditActionLabel(log.action)}</td>
                    <td style={{ color: "var(--text-muted)" }}>{log.detail ?? "—"}</td>
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{log.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "var(--sp-4)",
            }}
          >
            <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>
              {total} bản ghi · Trang {page}/{totalPages}
            </span>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ChevronLeft size={15} />}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trước
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sau
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
