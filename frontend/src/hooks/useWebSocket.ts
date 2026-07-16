import { useEffect, useRef, useState } from "react";
import type { WsEvent } from "../types";

// Kết nối thẳng tới backend, không qua Vite dev proxy (WebSocketServer nhận mọi upgrade
// request trên http.Server, không phân biệt path). Cookie SameSite=Strict vẫn được gửi
// vì cùng site (chỉ khác cổng).
function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:4000`;
}

export function useWebSocket(enabled: boolean) {
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(getWsUrl());
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        setLastEvent(JSON.parse(event.data));
      } catch {
        // bỏ qua message không parse được
      }
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [enabled]);

  return { lastEvent };
}
