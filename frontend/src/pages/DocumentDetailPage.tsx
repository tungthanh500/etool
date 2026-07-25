import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  Check,
  X,
  PencilLine,
  RotateCcw,
  FileText,
  FileCheck,
  Download,
  Paperclip,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { apiGet, apiPost, apiPostForm, apiPatchForm, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  PageHeader,
  PageLoading,
  PromptDialog,
  Textarea,
  useToast,
} from "../components/ui";
import { AttachmentPicker } from "../components/documentForms/AttachmentPicker";
import { DocumentFormFields } from "../components/documentForms/DocumentFormFields";
import { DocumentFormSummary, hasFormSummaryContent } from "../components/documentForms/DocumentFormSummary";
import {
  statusLabel,
  typeLabel,
  actionLabel,
  stepLabel,
  STATUS_TONES,
  ACTION_TONES,
  EVENT_LABELS,
  EVENT_TONES,
} from "../lib/labels";
import { defaultFormValue, filePolicyFor, hasAutoTitle, serializeFormDataForSubmit } from "../lib/documentFormMeta";
import { formatDateTime } from "../lib/formatDate";
import type { DocumentDetail } from "../types";

// Cấu hình modal nhập lý do cho các hành động cần comment.
interface PromptConfig {
  path: string;
  title: string;
  label: string;
  confirmLabel: string;
  confirmTone: "primary" | "danger" | "orange";
  message?: ReactNode;
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [prompt, setPrompt] = useState<PromptConfig | null>(null);
  const [approvedFile, setApprovedFile] = useState<File | null>(null);
  const approvedFileInputRef = useRef<HTMLInputElement>(null);
  const { lastEvent } = useWebSocket(true);

  // Chỉnh sửa nội dung khi bị yêu cầu chỉnh sửa (mục 2.1) — dùng chung form theo loại (5.1)
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editFormData, setEditFormData] = useState<unknown>({});
  const [editRemoveIds, setEditRemoveIds] = useState<Set<string>>(new Set());
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // Xác nhận duyệt (R21): tránh 1 click nhầm là duyệt luôn — hành động không hoàn tác được.
  const [confirmApprove, setConfirmApprove] = useState(false);

  const fetchDoc = useCallback(async () => {
    if (!id) return;
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
    if (lastEvent && lastEvent.documentId === id) {
      fetchDoc();
      toast({
        tone: EVENT_TONES[lastEvent.type] ?? "primary",
        title: lastEvent.actorName,
        message: EVENT_LABELS[lastEvent.type] ?? lastEvent.type,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent, id]);

  // Toast nói rõ hành động vừa xong thay vì "Đã xử lý thành công" chung chung.
  const ACTION_SUCCESS_MESSAGES: Record<string, string> = {
    reject: "Đã từ chối văn bản",
    "request-change": "Đã gửi yêu cầu chỉnh sửa",
    resubmit: "Đã nộp lại văn bản",
    withdraw: "Đã thu hồi văn bản",
  };

  async function runAction(path: string, comment?: string) {
    if (!id) return;
    setBusy(true);
    try {
      await apiPost(`/api/documents/${id}/${path}`, comment ? { comment } : {});
      setPrompt(null);
      await fetchDoc();
      toast({ tone: "success", message: ACTION_SUCCESS_MESSAGES[path] ?? "Đã xử lý thành công" });
    } catch (err) {
      toast({ tone: "danger", message: err instanceof ApiError ? err.message : "Thao tác thất bại" });
    } finally {
      setBusy(false);
    }
  }

  // Duyệt: nếu có bản đã ký (bước cuối) thì gửi multipart, ngược lại gửi JSON như cũ.
  // Ý kiến kèm duyệt là tuỳ chọn — backend đã nhận sẵn `comment` ở cả 2 dạng body.
  async function approve(comment?: string) {
    if (!id) return;
    setBusy(true);
    try {
      if (approvedFile) {
        const body = new FormData();
        body.append("approvedFile", approvedFile);
        if (comment) body.append("comment", comment);
        await apiPostForm(`/api/documents/${id}/approve`, body);
      } else {
        await apiPost(`/api/documents/${id}/approve`, comment ? { comment } : {});
      }
      setConfirmApprove(false);
      setApprovedFile(null);
      await fetchDoc();
      toast({ tone: "success", message: "Đã duyệt văn bản" });
    } catch (err) {
      toast({ tone: "danger", message: err instanceof ApiError ? err.message : "Thao tác thất bại" });
    } finally {
      setBusy(false);
    }
  }

  // Thu hồi dùng chung cơ chế runAction + PromptDialog (bắt buộc nhập lý do) — giống
  // Từ chối/Yêu cầu chỉnh sửa. Không còn hàm withdraw() riêng.

  async function submitComment() {
    if (!id || !comment.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/api/documents/${id}/comments`, { comment });
      setComment("");
      await fetchDoc();
    } catch (err) {
      toast({ tone: "danger", message: err instanceof ApiError ? err.message : "Gửi bình luận thất bại" });
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    if (!doc) return;
    setEditTitle(doc.title);
    setEditFormData(doc.formData ?? defaultFormValue(doc.type));
    setEditRemoveIds(new Set());
    setEditNewFiles([]);
    setEditError(null);
    setEditing(true);
  }

  function toggleRemoveAttachment(id: string) {
    setEditRemoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveEdit() {
    if (!id || !doc) return;
    setEditError(null);

    const policy = filePolicyFor(doc.type);
    const remainingFiles =
      originalAttachments.filter((a) => !editRemoveIds.has(a.id)).length + editNewFiles.length;
    if (policy === "required" && remainingFiles === 0) {
      setEditError("Cần đính kèm ít nhất 1 file");
      return;
    }
    if (!hasAutoTitle(doc.type) && !editTitle.trim()) {
      setEditError("Thiếu tiêu đề");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      if (!hasAutoTitle(doc.type)) body.append("title", editTitle);
      body.append("formData", JSON.stringify(serializeFormDataForSubmit(doc.type, editFormData)));
      body.append("removeAttachmentIds", JSON.stringify([...editRemoveIds]));
      editNewFiles.forEach((f) => body.append("attachments", f));
      await apiPatchForm(`/api/documents/${id}`, body);
      setEditing(false);
      await fetchDoc();
      toast({ tone: "success", message: "Đã lưu chỉnh sửa" });
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Lưu chỉnh sửa thất bại");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoading />;
  if (error) {
    return (
      <div>
        <PageHeader title="Văn bản" backTo="/documents" backLabel="Quay lại danh sách" />
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }
  if (!doc) return null;

  const canResubmit = doc.status === "CHANGES_REQUESTED" && doc.creatorId === user?.id;
  const canEdit = canResubmit;
  const canWithdraw = doc.status === "PENDING" && doc.creatorId === user?.id;
  const steps = [...doc.workflow.steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const isApproved = doc.status === "APPROVED";
  const isFinalStep = doc.currentStep >= steps.length;
  const originalAttachments = doc.attachments.filter((a) => a.kind !== "APPROVED");
  const approvedAttachments = doc.attachments.filter((a) => a.kind === "APPROVED");

  return (
    <div>
      <PageHeader
        title={doc.title}
        subtitle={
          <span style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center" }}>
            {doc.docNo && (
              <span style={{ fontFamily: "var(--font-mono)" }}>{doc.docNo} ·</span>
            )}
            {typeLabel(doc.type)} · Người tạo: {doc.creator.fullName}
          </span>
        }
        actions={<Badge tone={STATUS_TONES[doc.status] ?? "neutral"}>{statusLabel(doc.status)}</Badge>}
        backTo="/documents"
        backLabel="Quay lại danh sách"
      />

      {/* Banner duyệt theo uỷ quyền (mục 4.1) */}
      {doc.approvingVia && (
        <Alert tone="info">
          Bạn đang xem/duyệt hồ sơ này theo <strong>uỷ quyền của {doc.approvingVia}</strong> — nhật
          ký duyệt sẽ ghi rõ bạn duyệt thay.
        </Alert>
      )}

      {/* Meta + stepper */}
      <Card>
        <div className="meta-grid">
          <div className="meta-item">
            <div className="meta-item__label">Loại</div>
            <div className="meta-item__value">{typeLabel(doc.type)}</div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label">Người tạo</div>
            <div className="meta-item__value">{doc.creator.fullName}</div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label">Ngày tạo</div>
            <div className="meta-item__value">{formatDateTime(doc.createdAt)}</div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label">Tiến độ</div>
            <div className="meta-item__value">
              Bước {doc.currentStep}/{steps.length}
            </div>
          </div>
        </div>

        <div className="stepper section-gap">
          {steps.map((s) => {
            const done = isApproved || s.stepOrder < doc.currentStep;
            const current = !isApproved && s.stepOrder === doc.currentStep;
            return (
              <div
                key={s.id}
                className={`stepper__step ${done ? "is-done" : ""} ${current ? "is-current" : ""}`}
              >
                <span className="stepper__marker">
                  {done ? <Check size={15} /> : s.stepOrder}
                </span>
                <span className="stepper__label">{stepLabel(s)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Dữ liệu form đặc thù (R22 + renderer theo loại, mục 5.1) — người duyệt cần thấy để ra quyết định */}
      {hasFormSummaryContent(doc.type, doc.formData) && (
        <Card title="Dữ liệu form" className="section-gap">
          <DocumentFormSummary type={doc.type} formData={doc.formData} />
        </Card>
      )}

      {/* Đính kèm bản đã ký — chỉ ở bước duyệt cuối */}
      {doc.canApprove && isFinalStep && (
        <Card title="Bản đã ký (tuỳ chọn)" className="section-gap">
          <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
            Đính kèm bản đã ký khi bấm Duyệt. Sau khi duyệt xong, mọi người liên quan tải được bản này.
          </p>
          <input
            ref={approvedFileInputRef}
            type="file"
            accept=".pdf,.docx"
            hidden
            onChange={(e) => {
              setApprovedFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {approvedFile ? (
            <div className="file-chip" style={{ maxWidth: 360 }}>
              <span className="file-chip__icon">
                <FileCheck size={18} />
              </span>
              <span className="file-chip__name">{approvedFile.name}</span>
              <button
                type="button"
                className="icon-btn file-chip__actions"
                onClick={() => setApprovedFile(null)}
                aria-label="Bỏ file"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Paperclip size={16} />}
              onClick={() => approvedFileInputRef.current?.click()}
            >
              Chọn bản đã ký (.pdf, .docx)
            </Button>
          )}
        </Card>
      )}

      {/* Chỉnh sửa nội dung khi bị yêu cầu chỉnh sửa (mục 2.1) — dùng chung form theo loại (5.1) */}
      {canEdit && editing && (
        <Card title="Chỉnh sửa văn bản" className="section-gap">
          <div className={`form-stack ${doc.type === "PAYMENT" ? "form-stack--wide" : ""}`}>
            <DocumentFormFields
              type={doc.type}
              title={editTitle}
              onTitleChange={setEditTitle}
              formData={editFormData}
              onFormDataChange={setEditFormData}
            />

            {originalAttachments.length > 0 && (
              <Field label="File hiện có" hint="Đánh dấu để xoá file khỏi văn bản">
                <div className="file-list">
                  {originalAttachments.map((a) => {
                    const marked = editRemoveIds.has(a.id);
                    return (
                      <label
                        key={a.id}
                        className="file-chip"
                        style={{ cursor: "pointer", opacity: marked ? 0.5 : 1 }}
                      >
                        <input
                          type="checkbox"
                          checked={marked}
                          onChange={() => toggleRemoveAttachment(a.id)}
                          style={{ marginRight: "var(--sp-2)" }}
                        />
                        <span className="file-chip__icon">
                          <FileText size={18} />
                        </span>
                        <span>
                          <span
                            className="file-chip__name"
                            style={{ textDecoration: marked ? "line-through" : "none" }}
                          >
                            {a.fileName}
                          </span>
                        </span>
                        <span className="file-chip__actions">
                          <Trash2 size={16} color={marked ? "var(--danger)" : "var(--text-muted)"} />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Field>
            )}

            {filePolicyFor(doc.type) !== "hidden" && (
              <AttachmentPicker
                files={editNewFiles}
                onChange={setEditNewFiles}
                required={
                  filePolicyFor(doc.type) === "required" &&
                  originalAttachments.filter((a) => !editRemoveIds.has(a.id)).length === 0
                }
              />
            )}

            {editError && <Alert tone="danger">{editError}</Alert>}

            <div style={{ display: "flex", gap: "var(--sp-3)" }}>
              <Button variant="primary" disabled={busy} onClick={saveEdit}>
                Lưu chỉnh sửa
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Huỷ
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Hành động */}
      {(doc.canApprove || canResubmit || canWithdraw) && !editing && (
        <div className="doc-actions section-gap">
          {canWithdraw && (
            <Button
              variant="ghost"
              leftIcon={<Undo2 size={17} />}
              disabled={busy}
              onClick={() =>
                setPrompt({
                  path: "withdraw",
                  title: "Thu hồi văn bản",
                  label: "Lý do thu hồi",
                  confirmLabel: "Thu hồi",
                  confirmTone: "danger",
                  message:
                    "Văn bản sẽ chuyển sang trạng thái Đã thu hồi và không thể nộp lại — muốn trình lại phải tạo văn bản mới. Người đã duyệt và người đang chờ duyệt sẽ nhận được thông báo.",
                })
              }
            >
              Thu hồi
            </Button>
          )}
          {canEdit && (
            <Button
              variant="orange"
              leftIcon={<PencilLine size={17} />}
              disabled={busy}
              onClick={startEditing}
            >
              Chỉnh sửa
            </Button>
          )}
          {doc.canApprove && (
            <>
              <Button
                variant="success"
                leftIcon={<Check size={17} />}
                disabled={busy}
                onClick={() => setConfirmApprove(true)}
              >
                Duyệt
              </Button>
              <Button
                variant="danger"
                leftIcon={<X size={17} />}
                disabled={busy}
                onClick={() =>
                  setPrompt({
                    path: "reject",
                    title: "Từ chối văn bản",
                    label: "Lý do từ chối",
                    confirmLabel: "Từ chối",
                    confirmTone: "danger",
                  })
                }
              >
                Từ chối
              </Button>
              <Button
                variant="orange"
                leftIcon={<PencilLine size={17} />}
                disabled={busy}
                onClick={() =>
                  setPrompt({
                    path: "request-change",
                    title: "Yêu cầu chỉnh sửa",
                    label: "Nội dung cần chỉnh sửa",
                    confirmLabel: "Gửi yêu cầu",
                    confirmTone: "orange",
                  })
                }
              >
                Yêu cầu chỉnh sửa
              </Button>
            </>
          )}
          {canResubmit && (
            <Button
              variant="primary"
              leftIcon={<RotateCcw size={17} />}
              disabled={busy}
              onClick={() => runAction("resubmit")}
            >
              Nộp lại
            </Button>
          )}
        </div>
      )}

      {/* File đính kèm (bản gốc) */}
      <Card title="File đính kèm" className="section-gap">
        {originalAttachments.length === 0 ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            <Paperclip size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Không có file đính kèm.
          </p>
        ) : (
          <div className="file-list">
            {originalAttachments.map((a) => (
              <a
                key={a.id}
                className="file-chip"
                href={`/api/documents/${doc.id}/attachments/${a.id}/download`}
              >
                <span className="file-chip__icon">
                  <FileText size={18} />
                </span>
                <span>
                  <span className="file-chip__name">{a.fileName}</span>
                </span>
                <span className="file-chip__actions">
                  <Download size={17} color="var(--text-muted)" />
                </span>
              </a>
            ))}
          </div>
        )}
      </Card>

      {/* Bản đã duyệt / đã ký — chỉ hiện khi có */}
      {approvedAttachments.length > 0 && (
        <Card title="Bản đã duyệt" className="section-gap">
          <div className="file-list">
            {approvedAttachments.map((a) => (
              <a
                key={a.id}
                className="file-chip"
                href={`/api/documents/${doc.id}/attachments/${a.id}/download`}
              >
                <span className="file-chip__icon" style={{ color: "var(--success)" }}>
                  <FileCheck size={18} />
                </span>
                <span>
                  <span className="file-chip__name">{a.fileName}</span>
                </span>
                <span className="file-chip__actions">
                  <Download size={17} color="var(--text-muted)" />
                </span>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Timeline & thảo luận */}
      <Card title="Lịch sử & thảo luận" className="section-gap">
        <ul className="timeline">
          {doc.logs.map((log) => (
            <li key={log.id} className="tl-item">
              <span className="tl-item__avatar">
                <Avatar name={log.user.fullName} size="md" />
              </span>
              <div className="tl-item__body">
                <div className="tl-item__head">
                  <span className="tl-item__author">{log.user.fullName}</span>
                  <Badge tone={ACTION_TONES[log.action] ?? "neutral"}>{actionLabel(log.action)}</Badge>
                  <span className="tl-item__time">{formatDateTime(log.createdAt)}</span>
                </div>
                {log.comment && <div className="tl-item__comment">{log.comment}</div>}
              </div>
            </li>
          ))}
        </ul>

        <div className="comment-box">
          <Textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Nhập bình luận..."
          />
          <Button
            variant="primary"
            leftIcon={<Send size={16} />}
            disabled={busy || !comment.trim()}
            onClick={submitComment}
          >
            Gửi
          </Button>
        </div>
      </Card>

      <PromptDialog
        open={prompt !== null}
        title={prompt?.title ?? ""}
        label={prompt?.label}
        message={prompt?.message}
        confirmLabel={prompt?.confirmLabel}
        confirmTone={prompt?.confirmTone}
        loading={busy}
        onCancel={() => setPrompt(null)}
        onSubmit={(value) => prompt && runAction(prompt.path, value)}
      />

      <PromptDialog
        open={confirmApprove}
        title="Duyệt văn bản"
        message={
          <>
            {isFinalStep
              ? "Đây là bước duyệt cuối — văn bản sẽ chuyển sang trạng thái Đã duyệt."
              : "Văn bản sẽ chuyển sang bước duyệt tiếp theo."}
            {approvedFile && (
              <>
                {" "}
                Kèm bản đã ký: <strong>{approvedFile.name}</strong>.
              </>
            )}
          </>
        }
        label="Ý kiến (tuỳ chọn)"
        optional
        confirmLabel="Duyệt"
        confirmTone="success"
        loading={busy}
        onCancel={() => setConfirmApprove(false)}
        onSubmit={(value) => approve(value || undefined)}
      />
    </div>
  );
}
