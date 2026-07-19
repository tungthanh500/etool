import app from "./app";
import { initWebSocket } from "./lib/ws";
import { initReminderJob } from "./lib/reminder";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
// Production sau reverse proxy: set HOST=127.0.0.1 (systemd unit) để cổng 4000 không còn
// truy cập thẳng từ LAN — mọi traffic buộc đi qua HTTPS proxy. Dev: bind mọi interface.
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`Backend server listening on ${HOST}:${PORT}`);
});

initWebSocket(server);
initReminderJob();
