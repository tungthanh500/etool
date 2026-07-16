import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPostForm, ApiError } from "../api/client";
import type { DocumentDetail } from "../types";

export function CreateDocumentPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"GENERAL" | "PURCHASE" | "PAYMENT">("GENERAL");
  const [formData, setFormData] = useState("{}");
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      JSON.parse(formData);
    } catch {
      setError("formData phải là JSON hợp lệ");
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("title", title);
      body.append("type", type);
      body.append("formData", formData);
      if (files) {
        for (const file of Array.from(files)) {
          body.append("attachments", file);
        }
      }
      const created = await apiPostForm<DocumentDetail>("/api/documents", body);
      navigate(`/documents/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tạo văn bản thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Tạo văn bản mới</h1>
        <Link to="/documents">← Quay lại danh sách</Link>
      </header>

      <form className="doc-form" onSubmit={handleSubmit}>
        <label>
          Tiêu đề
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Loại văn bản
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="GENERAL">Trình duyệt văn bản chung</option>
            <option value="PURCHASE">Yêu cầu mua sắm vật tư</option>
            <option value="PAYMENT">Đề xuất thanh toán</option>
          </select>
        </label>
        <label>
          Dữ liệu form (JSON)
          <textarea rows={6} value={formData} onChange={(e) => setFormData(e.target.value)} />
        </label>
        <label>
          Đính kèm file (.pdf, .docx)
          <input type="file" multiple accept=".pdf,.docx" onChange={(e) => setFiles(e.target.files)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Đang gửi..." : "Gửi văn bản"}
        </button>
      </form>
    </div>
  );
}
