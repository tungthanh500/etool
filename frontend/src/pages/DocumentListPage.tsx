import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, FileText, Inbox, Plus, FilePlus2, Search } from "lucide-react";
import { apiGet, apiDownload, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import {
  Alert,
  Badge,
  Button,
  DateInput,
  EmptyState,
  Select,
  SkeletonRows,
  useToast,
} from "../components/ui";
import {
  statusLabel,
  typeLabel,
  STATUS_LABELS,
  STATUS_TONES,
  EVENT_LABELS,
  EVENT_TONES,
} from "../lib/labels";
import { formatDateTime } from "../lib/formatDate";
import type { DocumentListResponse, DocumentSummary } from "../types";

const LIMIT = 20;

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <span className="step-dots" title={`Bước ${current}/${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const cls = n < current ? "is-done" : n === current ? "is-current" : "";
        return <span key={i} className={`step-dots__dot ${cls}`} />;
      })}
      <span className="step-dots__label">
        {current}/{total}
      </span>
    </span>
  );
}

export function DocumentListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "pending" ? "pending" : "own";
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const creator = params.get("creator") ?? "";
  const approvedBy = params.get("approvedBy") ?? "";
  const approvedFrom = params.get("approvedFrom") ?? "";
  const approvedTo = params.get("approvedTo") ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Danh sách {id, fullName} cho ô "Đã duyệt bởi" — backend chỉ trả những người có quyền
  // duyệt (role có document:approve:* hoặc Admin), endpoint mở cho mọi user đã đăng nhập.
  const [userOptions, setUserOptions] = useState<{ id: string; fullName: string }[]>([]);
  const { lastEvent } = useWebSocket(true);
  const { toast } = useToast();

  useEffect(() => {
    apiGet<{ id: string; fullName: string }[]>("/api/users/options")
      .then(setUserOptions)
      .catch(() => setUserOptions([]));
  }, []);

  // Gom bộ lọc đang áp thành query string — dùng chung cho fetchList và Xuất Excel.
  function buildFilterParams(): URLSearchParams {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (creator) qs.set("creator", creator);
    if (approvedBy) qs.set("approvedBy", approvedBy);
    if (approvedFrom) qs.set("approvedFrom", approvedFrom);
    if (approvedTo) qs.set("approvedTo", approvedTo);
    return qs;
  }

  // Xuất Excel theo đúng bộ lọc đang áp của tab "Của tôi".
  async function handleExport() {
    setExporting(true);
    try {
      const qs = buildFilterParams();
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      await apiDownload(`/api/documents/export${suffix}`, "danh-sach-van-ban.xlsx");
    } catch (err) {
      toast({
        tone: "danger",
        title: "Xuất Excel thất bại",
        message: err instanceof ApiError ? err.message : "Không thể xuất file",
      });
    } finally {
      setExporting(false);
    }
  }

  // Đổi bất kỳ field lọc nào (trừ page/tab) đều reset về trang 1 — tránh đứng ở
  // trang 5 của kết quả cũ rồi bấm lọc mới ra danh sách rỗng gây hiểu nhầm "hết dữ liệu".
  function updateFilter(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.set("page", "1");
    setParams(next);
  }

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const path = tab === "own" ? "/api/documents" : "/api/documents/pending";
      const qs = buildFilterParams();
      qs.set("page", String(page));
      qs.set("limit", String(LIMIT));
      const data = await apiGet<DocumentListResponse>(`${path}?${qs.toString()}`);
      setDocuments(data.items);
      setTotal(data.total);
      setLoadError(false);
    } catch (err) {
      // Giữ nguyên danh sách cũ khi tải lỗi — không xoá về rỗng để tránh người duyệt
      // hiểu nhầm "không có hồ sơ nào" trong khi thực chất là lỗi mạng/server.
      setLoadError(true);
      toast({
        tone: "danger",
        title: "Không tải được danh sách văn bản",
        message: err instanceof ApiError ? err.message : "Vui lòng thử lại.",
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildFilterParams đọc lại đúng các state đã có trong deps bên dưới, không cần thêm chính nó vào deps
  }, [tab, q, status, from, to, creator, approvedBy, approvedFrom, approvedTo, page, toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Sự kiện realtime: vừa refetch danh sách, vừa hiện toast.
  useEffect(() => {
    if (!lastEvent) return;
    fetchList();
    toast({
      tone: EVENT_TONES[lastEvent.type] ?? "primary",
      title: lastEvent.actorName,
      message: `${EVENT_LABELS[lastEvent.type] ?? lastEvent.type}: ${lastEvent.title}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ muốn chạy lại khi CÓ event mới, không phải khi fetchList/toast đổi identity
  }, [lastEvent]);

  const canCreate = user?.role.permissions.includes("document:create") ?? false;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters = q || status || from || to || creator || approvedBy || approvedFrom || approvedTo;

  return (
    <div>
      <div className="list-toolbar">
        <div className="segmented" role="tablist" aria-label="Chuyển tab danh sách văn bản">
          <button
            type="button"
            className={`segmented__item ${tab === "own" ? "is-active" : ""}`}
            role="tab"
            aria-selected={tab === "own"}
            onClick={() => setParams({})}
          >
            <FileText size={16} />
            Của tôi
          </button>
          <button
            type="button"
            className={`segmented__item ${tab === "pending" ? "is-active" : ""}`}
            role="tab"
            aria-selected={tab === "pending"}
            onClick={() => setParams({ tab: "pending" })}
          >
            <Inbox size={16} />
            Chờ tôi duyệt
          </button>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-3)" }}>
          {tab === "own" && (
            <Button
              variant="ghost"
              leftIcon={<Download size={17} />}
              loading={exporting}
              onClick={handleExport}
            >
              Xuất Excel
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" leftIcon={<Plus size={17} />} onClick={() => navigate("/documents/new")}>
              Tạo văn bản
            </Button>
          )}
        </div>
      </div>

      <div className="list-filters">
        <div className="list-filters__search">
          <Search size={16} />
          <input
            className="input list-filters__search-input"
            value={q}
            onChange={(e) => updateFilter({ q: e.target.value })}
            placeholder="Tìm theo tiêu đề hoặc số văn bản..."
          />
        </div>
        <Select value={status} onChange={(e) => updateFilter({ status: e.target.value })}>
          <option value="">Tất cả trạng thái</option>
          {Object.keys(STATUS_LABELS).map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
        <div className="filter-range">
          <span className="list-filters__label">Ngày nộp</span>
          <DateInput value={from} onChange={(v) => updateFilter({ from: v })} aria-label="Ngày nộp từ ngày" />
          <span className="list-filters__sep">–</span>
          <DateInput value={to} onChange={(v) => updateFilter({ to: v })} aria-label="Ngày nộp đến ngày" />
        </div>
      </div>

      {/* Bộ lọc theo người: người nộp (chỉ tab Chờ tôi duyệt — tab Của tôi toàn văn bản
          của mình) + lần duyệt của một người cụ thể trong khoảng ngày (query DocumentLog). */}
      <div className="list-filters">
        {tab === "pending" && (
          <div className="list-filters__search">
            <Search size={16} />
            <input
              className="input list-filters__search-input"
              value={creator}
              onChange={(e) => updateFilter({ creator: e.target.value })}
              placeholder="Tìm theo tên người nộp..."
            />
          </div>
        )}
        <div className="filter-range">
          <span className="list-filters__label">Đã duyệt bởi</span>
          <Select value={approvedBy} onChange={(e) => updateFilter({ approvedBy: e.target.value })}>
            <option value="">Bất kỳ ai</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
        </div>
        <div className="filter-range">
          <span className="list-filters__label">Ngày duyệt</span>
          <DateInput
            value={approvedFrom}
            onChange={(v) => updateFilter({ approvedFrom: v })}
            aria-label="Ngày duyệt từ ngày"
          />
          <span className="list-filters__sep">–</span>
          <DateInput
            value={approvedTo}
            onChange={(v) => updateFilter({ approvedTo: v })}
            aria-label="Ngày duyệt đến ngày"
          />
        </div>
      </div>

      {loading ? (
        <div className="table-wrap">
          <SkeletonRows rows={5} cols={6} />
        </div>
      ) : loadError && documents.length === 0 ? (
        <Alert tone="danger">
          Không tải được danh sách văn bản — có thể do lỗi mạng hoặc server.{" "}
          <Button variant="ghost" size="sm" onClick={() => fetchList()}>
            Thử lại
          </Button>
        </Alert>
      ) : documents.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FilePlus2 size={26} />}
            title={
              hasFilters
                ? "Không tìm thấy văn bản phù hợp"
                : tab === "own"
                  ? "Chưa có văn bản nào"
                  : "Không có hồ sơ chờ duyệt"
            }
            desc={
              hasFilters
                ? "Thử đổi từ khoá hoặc bộ lọc khác."
                : tab === "own"
                  ? "Các văn bản bạn tạo sẽ hiển thị ở đây."
                  : "Khi có hồ sơ cần bạn phê duyệt, chúng sẽ xuất hiện tại đây."
            }
            action={
              !hasFilters && tab === "own" && canCreate ? (
                <Button variant="primary" leftIcon={<Plus size={17} />} onClick={() => navigate("/documents/new")}>
                  Tạo văn bản
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Số VB</th>
                  <th>Tiêu đề</th>
                  <th>Loại</th>
                  <th>Trạng thái</th>
                  <th>Tiến độ</th>
                  <th>Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="is-clickable"
                    tabIndex={0}
                    role="button"
                    aria-label={`Xem chi tiết văn bản ${doc.title}`}
                    onClick={() => navigate(`/documents/${doc.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/documents/${doc.id}`);
                      }
                    }}
                  >
                    <td style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {doc.docNo ?? "—"}
                    </td>
                    <td className="table__primary">{doc.title}</td>
                    <td>{typeLabel(doc.type)}</td>
                    <td>
                      <Badge tone={STATUS_TONES[doc.status] ?? "neutral"}>
                        {statusLabel(doc.status)}
                      </Badge>
                    </td>
                    <td>
                      <StepDots current={doc.currentStep} total={doc.workflow.steps.length} />
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>
                      {formatDateTime(doc.createdAt)}
                    </td>
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
              {total} văn bản · Trang {page}/{totalPages}
            </span>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ChevronLeft size={15} />}
                disabled={page <= 1}
                onClick={() => updateFilter({ page: String(page - 1) })}
              >
                Trước
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateFilter({ page: String(page + 1) })}
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
