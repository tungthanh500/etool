import { useEffect, useRef, useState } from "react";
import type { WsEvent } from "../types";

// Dev (Vite 5173): nối thẳng backend 4000 vì Vite dev proxy không proxy WebSocket upgrade
// của app này (WebSocketServer nhận mọi upgrade request trên http.Server, không phân biệt
// path). Cookie SameSite=Strict vẫn được gửi vì cùng site (chỉ khác cổng).
// Production sau reverse proxy (Caddy): cùng origin, path /ws — Caddyfile proxy về 4000.
function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  if (import.meta.env.DEV) {
    return `${protocol}://${window.location.hostname}:4000`;
  }
  return `${protocol}://${window.location.host}/ws`;
}

const MAX_BACKOFF_MS = 30000;

export function useWebSocket(enabled: boolean) {
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Phân biệt đóng do cleanup (unmount/disable) với đóng ngoài ý muốn (mất mạng, backend
    // restart) — chỉ nhánh sau mới lên lịch reconnect.
    let closedByCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function connect() {
      const ws = new WebSocket(getWsUrl());
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          setLastEvent(JSON.parse(event.data));
        } catch {
          // bỏ qua message không parse được
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (closedByCleanup) return;
        const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled]);

  return { lastEvent, connected };
}
