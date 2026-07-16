import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGet, apiPost, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { Toast } from "../components/Toast";
import { formatDateTime } from "../lib/formatDate";
import type { DocumentDetail } from "../types";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
  CHANGES_REQUESTED: "Yêu cầu chỉnh sửa",
};

const ACTION_LABELS: Record<string, string> = {
  SUBMIT: "Nộp",
  APPROVE: "Duyệt",
  REJECT: "Từ chối",
  REQUEST_CHANGE: "Yêu cầu chỉnh sửa",
  COMMENT: "Bình luận",
};

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const { lastEvent } = useWebSocket(true);

  const fetchDoc = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDoc(await apiGet<DocumentDetail>(`/api/documents/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tải được văn bản");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  useEffect(() => {
    if (lastEvent && lastEvent.documentId === id) fetchDoc();
  }, [lastEvent, id, fetchDoc]);

  async function runAction(path: string, requireComment: boolean) {
    if (!id) return;
    let body: { comment?: string } = {};
    if (requireComment) {
      const reason = window.prompt("Nhập lý do:");
      if (!reason) return;
      body = { comment: reason };
    }
    setBusy(true);
    try {
      await apiPost(`/api/documents/${id}/${path}`, body);
      await fetchDoc();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Thao tác thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    if (!id || !comment.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/api/documents/${id}/comments`, { comment });
      setComment("");
      await fetchDoc();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Gửi bình luận thất bại");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="page">Đang tải...</div>;
  if (error) {
    return (
      <div className="page">
        <p className="form-error">{error}</p>
        <Link to="/documents">← Quay lại danh sách</Link>
      </div>
    );
  }
  if (!doc) return null;

  const canResubmit = doc.status === "CHANGES_REQUESTED" && doc.creatorId === user?.id;

  return (
    <div className="page">
      <header className="page-header">
        <h1>{doc.title}</h1>
        <Link to="/documents">← Quay lại danh sách</Link>
      </header>

      <section className="doc-meta">
        <p>
          Loại: <strong>{doc.type}</strong> · Trạng thái:{" "}
          <span className={`badge badge-${doc.status.toLowerCase()}`}>{STATUS_LABELS[doc.status] ?? doc.status}</span> ·
          Bước {doc.currentStep}/{doc.workflow.steps.length} · Người tạo: {doc.creator.fullName}
        </p>
      </section>

      <section>
        <h2>File đính kèm</h2>
        {doc.attachments.length === 0 ? (
          <p>Không có file đính kèm.</p>
        ) : (
          <ul>
            {doc.attachments.map((a) => (
              <li key={a.id}>
                <a href={`/api/documents/${doc.id}/attachments/${a.id}/download`}>{a.fileName}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(doc.canApprove || canResubmit) && (
        <section className="doc-actions">
          {doc.canApprove && (
            <>
              <button disabled={busy} onClick={() => runAction("approve", false)}>
                Duyệt
              </button>
              <button disabled={busy} onClick={() => runAction("reject", true)}>
                Từ chối
              </button>
              <button disabled={busy} onClick={() => runAction("request-change", true)}>
                Yêu cầu chỉnh sửa
              </button>
            </>
          )}
          {canResubmit && (
            <button disabled={busy} onClick={() => runAction("resubmit", false)}>
              Nộp lại
            </button>
          )}
        </section>
      )}

      <section>
        <h2>Lịch sử & thảo luận</h2>
        <ul className="timeline">
          {doc.logs.map((log) => (
            <li key={log.id}>
              <strong>{log.user.fullName}</strong> — {ACTION_LABELS[log.action] ?? log.action}
              {log.comment && <>: {log.comment}</>}
              <span className="timeline-time"> ({formatDateTime(log.createdAt)})</span>
            </li>
          ))}
        </ul>

        <div className="comment-box">
          <textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Nhập bình luận..."
          />
          <button disabled={busy || !comment.trim()} onClick={submitComment}>
            Gửi
          </button>
        </div>
      </section>

      <Toast event={lastEvent} />
    </div>
  );
}
