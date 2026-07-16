import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [supported] = useState(() => "serviceWorker" in navigator && "PushManager" in window);

  const subscribe = useCallback(async () => {
    if (!supported) return;

    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return;

    const registration = await navigator.serviceWorker.register("/service-worker.js");
    const { publicKey } = await apiGet<{ publicKey: string }>("/api/push/public-key");

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });

    const json = subscription.toJSON();
    await apiPost("/api/push/subscribe", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    });
  }, [supported]);

  // Nếu đã cấp quyền từ trước (phiên trước), tự đăng ký lại âm thầm —
  // pushManager.subscribe() trả về subscription cũ nếu còn hiệu lực, không hỏi lại quyền.
  useEffect(() => {
    if (supported && permission === "granted") {
      subscribe().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  return { supported, permission, subscribe };
}
