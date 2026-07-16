self.addEventListener("push", (event) => {
  let data = { title: "e-Approval", body: "Có cập nhật mới" };
  try {
    const parsed = event.data.json();
    data = {
      title: "e-Approval",
      body: `${parsed.actorName ?? ""}: ${parsed.title ?? ""}`.trim(),
      documentId: parsed.documentId,
    };
  } catch {
    // giữ nguyên giá trị mặc định nếu payload không parse được
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.svg",
      data: { documentId: data.documentId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const documentId = event.notification.data?.documentId;
  const url = documentId ? `/documents/${documentId}` : "/documents";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
