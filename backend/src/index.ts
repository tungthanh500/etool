import app from "./app";
import { initWebSocket } from "./lib/ws";
import { initReminderJob } from "./lib/reminder";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const server = app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});

initWebSocket(server);
initReminderJob();
