import { useEffect, useState } from "react";
import { apiPost } from "../api/client";
import type { FormPreviewResult } from "@etool/shared";

// Debounce 300ms trước khi gọi backend tính preview (Fat Server) — tránh spam request
// mỗi phím gõ. `enabled=false` bỏ qua hẳn (vd. LEAVE chưa đủ 2 ngày).
export function useDocumentFormPreview(type: string, formData: unknown, enabled: boolean): FormPreviewResult | null {
  const [result, setResult] = useState<FormPreviewResult | null>(null);

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiPost<FormPreviewResult>("/api/documents/preview", { type, formData })
        .then((res) => {
          if (!cancelled) setResult(res);
        })
        .catch(() => {
          if (!cancelled) setResult(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, JSON.stringify(formData), enabled]);

  return result;
}
