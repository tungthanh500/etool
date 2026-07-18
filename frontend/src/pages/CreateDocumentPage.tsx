import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, FileText, X } from "lucide-react";
import { apiGet, apiPostForm, ApiError } from "../api/client";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageLoading,
  Select,
  Textarea,
  PageHeader,
} from "../components/ui";
import { typeLabel } from "../lib/labels";
import type { DocumentDetail, Workflow } from "../types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function CreateDocumentPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [type, setType] = useState("");
  const [formData, setFormData] = useState("{}");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Workflow[]>("/api/workflows")
      .then((list) => {
        setWorkflows(list);
        if (list.length > 0) setType(list[0].name);
      })
      .finally(() => setLoading(false));
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      JSON.parse(formData);
    } catch {
      setError("Dữ liệu form phải là JSON hợp lệ");
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("title", title);
      body.append("type", type);
      body.append("formData", formData);
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

  return (
    <div>
      <PageHeader title="Tạo văn bản mới" backTo="/documents" backLabel="Quay lại danh sách" />

      <Card>
        <form className="form-stack" onSubmit={handleSubmit}>
          <Field label="Tiêu đề">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Đề xuất mua cáp điện cho xưởng A"
              required
              autoFocus
            />
          </Field>

          <Field label="Loại văn bản">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {workflows.map((w) => (
                <option key={w.id} value={w.name}>
                  {typeLabel(w.name)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Dữ liệu form (JSON — nâng cao)"
            hint="Thông tin đặc thù của đơn dưới dạng JSON. Để trống {} nếu chưa dùng."
          >
            <Textarea rows={5} mono value={formData} onChange={(e) => setFormData(e.target.value)} />
          </Field>

          <Field label="File đính kèm" hint="Chấp nhận .pdf, .docx · tối đa 15MB mỗi file">
            <div
              className={`dropzone ${dragging ? "is-drag" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <UploadCloud size={26} />
              <div>Kéo thả file vào đây hoặc bấm để chọn</div>
              <div className="dropzone__hint">.pdf, .docx</div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx"
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {files.length > 0 && (
              <div className="file-list" style={{ marginTop: "var(--sp-3)" }}>
                {files.map((f, i) => (
                  <div key={i} className="file-chip">
                    <span className="file-chip__icon">
                      <FileText size={18} />
                    </span>
                    <span>
                      <span className="file-chip__name">{f.name}</span>
                      <span className="file-chip__meta"> · {formatBytes(f.size)}</span>
                    </span>
                    <button
                      type="button"
                      className="icon-btn file-chip__actions"
                      onClick={() => removeFile(i)}
                      aria-label="Xoá file"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Field>

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
