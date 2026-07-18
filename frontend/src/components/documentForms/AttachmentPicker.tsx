import { useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { Field } from "../ui";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface AttachmentPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  required?: boolean;
}

// Dropzone chọn file mới — tách từ CreateDocumentPage cũ (mục 5.1) để dùng chung được cho
// cả GENERAL/PURCHASE/PAYMENT (LEAVE không cần, filePolicyFor trả "hidden" nên không render).
export function AttachmentPicker({ files, onChange, required }: AttachmentPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    onChange([...files, ...Array.from(list)]);
  }
  function removeFile(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <Field
      label={required ? "File đính kèm (bắt buộc)" : "File đính kèm"}
      hint="Chấp nhận .pdf, .docx · tối đa 15MB mỗi file"
    >
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
  );
}
