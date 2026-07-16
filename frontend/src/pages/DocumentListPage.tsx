import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { Toast } from "../components/Toast";
import type { DocumentSummary } from "../types";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
  CHANGES_REQUESTED: "Yêu cầu chỉnh sửa",
};

export function DocumentListPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<"own" | "pending">("own");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { lastEvent } = useWebSocket(true);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const path = tab === "own" ? "/api/documents" : "/api/documents/pending";
      setDocuments(await apiGet<DocumentSummary[]>(path));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (lastEvent) fetchList();
  }, [lastEvent, fetchList]);

  const canCreate = user?.role.permissions.includes("document:create") ?? false;

  return (
    <div className="page">
      <header className="page-header">
        <h1>e-Approval</h1>
        <div>
          <span className="current-user">
            {user?.fullName} ({user?.role.name})
          </span>
          <button onClick={() => logout()}>Đăng xuất</button>
        </div>
      </header>

      <div className="tabs">
        <button className={tab === "own" ? "active" : ""} onClick={() => setTab("own")}>
          Của tôi
        </button>
        <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
          Chờ tôi duyệt
        </button>
        {canCreate && (
          <Link className="btn-create" to="/documents/new">
            + Tạo văn bản
          </Link>
        )}
      </div>

      {loading ? (
        <p>Đang tải...</p>
      ) : documents.length === 0 ? (
        <p>Không có văn bản nào.</p>
      ) : (
        <table className="doc-table">
          <thead>
            <tr>
              <th>Tiêu đề</th>
              <th>Loại</th>
              <th>Trạng thái</th>
              <th>Bước</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <Link to={`/documents/${doc.id}`}>{doc.title}</Link>
                </td>
                <td>{doc.type}</td>
                <td>
                  <span className={`badge badge-${doc.status.toLowerCase()}`}>
                    {STATUS_LABELS[doc.status] ?? doc.status}
                  </span>
                </td>
                <td>
                  {doc.currentStep}/{doc.workflow.steps.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Toast event={lastEvent} />
    </div>
  );
}
