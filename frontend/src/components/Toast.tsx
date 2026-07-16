import { useEffect, useState } from "react";
import type { WsEvent } from "../types";

const EVENT_LABELS: Record<string, string> = {
  "document:created": "đã tạo văn bản",
  "document:step_advanced": "đã duyệt, chuyển bước tiếp theo",
  "document:approved": "đã được duyệt xong",
  "document:rejected": "đã bị từ chối",
  "document:changes_requested": "yêu cầu chỉnh sửa",
  "document:resubmitted": "đã nộp lại",
  "document:commented": "đã bình luận",
};

export function Toast({ event }: { event: WsEvent | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!event) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [event]);

  if (!event || !visible) return null;

  const label = EVENT_LABELS[event.type] ?? event.type;

  return (
    <div className="toast">
      <strong>{event.actorName}</strong> {label}: {event.title}
    </div>
  );
}
