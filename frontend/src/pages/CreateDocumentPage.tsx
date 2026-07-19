import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, FileText, ShoppingCart, Wallet } from "lucide-react";
import { apiGet, apiPostForm, ApiError } from "../api/client";
import { Alert, Button, Card, PageHeader, PageLoading } from "../components/ui";
import { AttachmentPicker } from "../components/documentForms/AttachmentPicker";
import { DocumentFormFields } from "../components/documentForms/DocumentFormFields";
import { typeLabel } from "../lib/labels";
import { defaultFormValue, filePolicyFor, hasAutoTitle, serializeFormDataForSubmit } from "../lib/documentFormMeta";
import type { DocumentDetail, Workflow } from "../types";

const TYPE_ICONS: Record<string, typeof FileText> = {
  GENERAL: FileText,
  PURCHASE: ShoppingCart,
  PAYMENT: Wallet,
  LEAVE: CalendarDays,
};

// Mục 5.1: điều đầu tiên phải làm là chọn loại văn bản (bước 1) — form riêng cho từng
// loại chỉ hiện sau khi đã chọn (bước 2). Bỏ hẳn ô "Dữ liệu form (JSON — nâng cao)" cũ.
export function CreateDocumentPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [formData, setFormData] = useState<unknown>({});
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiGet<Workflow[]>("/api/workflows")
      .then(setWorkflows)
      .finally(() => setLoading(false));
  }, []);

  function selectType(t: string) {
    setType(t);
    setTitle("");
    setFormData(defaultFormValue(t));
    setFiles([]);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!type) return;
    setError(null);

    const policy = filePolicyFor(type);
    if (policy === "required" && files.length === 0) {
      setError("Cần đính kèm ít nhất 1 file");
      return;
    }
    if (!hasAutoTitle(type) && !title.trim()) {
      setError("Thiếu tiêu đề");
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      // LEAVE/PAYMENT tự sinh tiêu đề ở backend — không gửi title, để backend tự derive.
      if (!hasAutoTitle(type)) body.append("title", title);
      body.append("type", type);
      body.append("formData", JSON.stringify(serializeFormDataForSubmit(type, formData)));
      files.forEach((f) => body.append("attachments", f));
      const created = await apiPostForm<DocumentDetail>("/api/documents", body);
      navigate(`/documents/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tạo văn bản thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageLoading />;

  if (!type) {
    return (
      <div>
        <PageHeader title="Tạo văn bản mới" backTo="/documents" backLabel="Quay lại danh sách" />
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>Chọn loại văn bản để bắt đầu.</p>
        <div className="doc-type-grid">
          {workflows.map((w) => {
            const Icon = TYPE_ICONS[w.name] ?? FileText;
            return (
              <button key={w.id} type="button" className="doc-type-card" onClick={() => selectType(w.name)}>
                <span className="doc-type-card__icon">
                  <Icon size={26} />
                </span>
                <span className="doc-type-card__title">{typeLabel(w.name)}</span>
                {w.description && <span className="doc-type-card__desc">{w.description}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const policy = filePolicyFor(type);

  return (
    <div>
      <PageHeader
        title={`Tạo văn bản mới — ${typeLabel(type)}`}
        actions={
          <Button variant="ghost" leftIcon={<ArrowLeft size={16} />} onClick={() => setType(null)}>
            Đổi loại văn bản
          </Button>
        }
        backTo="/documents"
        backLabel="Quay lại danh sách"
      />

      <Card>
        <form className={`form-stack ${type === "PAYMENT" ? "form-stack--wide" : ""}`} onSubmit={handleSubmit}>
          <DocumentFormFields
            type={type}
            title={title}
            onTitleChange={setTitle}
            formData={formData}
            onFormDataChange={setFormData}
          />

          {policy !== "hidden" && (
            <AttachmentPicker files={files} onChange={setFiles} required={policy === "required"} />
          )}

          {error && <Alert tone="danger">{error}</Alert>}

          <div style={{ display: "flex", gap: "var(--sp-3)" }}>
            <Button type="submit" variant="primary" loading={submitting}>
              {submitting ? "Đang gửi..." : "Gửi văn bản"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/documents")}>
              Huỷ
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
