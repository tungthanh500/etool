import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "./jwt";
import { prisma } from "./prisma";

const COOKIE_NAME = process.env.COOKIE_NAME || "eapproval_token";

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

// userId -> tập các kết nối đang mở (1 user có thể có nhiều tab/thiết bị).
const connections = new Map<string, Set<WebSocket>>();

interface AuthenticatedRequest extends IncomingMessage {
  authenticatedUserId?: string;
}

export function initWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({
    server,
    verifyClient: (info, callback) => {
      const token = readCookie(info.req, COOKIE_NAME);
      if (!token) {
        callback(false, 401, "Unauthorized");
        return;
      }

      let userId: string;
      try {
        userId = verifyToken(token).sub;
      } catch {
        callback(false, 401, "Unauthorized");
        return;
      }

      prisma.user
        .findUnique({ where: { id: userId } })
        .then((user) => {
          if (!user) {
            callback(false, 401, "Unauthorized");
            return;
          }
          (info.req as AuthenticatedRequest).authenticatedUserId = user.id;
          callback(true);
        })
        .catch(() => callback(false, 500, "Internal Error"));
    },
  });

  wss.on("connection", (ws, req: AuthenticatedRequest) => {
    const userId = req.authenticatedUserId!;

    let sockets = connections.get(userId);
    if (!sockets) {
      sockets = new Set();
      connections.set(userId, sockets);
    }
    sockets.add(ws);

    ws.on("close", () => {
      sockets!.delete(ws);
      if (sockets!.size === 0) {
        connections.delete(userId);
      }
    });
  });
}

export function notifyUsers(userIds: string[], event: Record<string, unknown>): void {
  const payload = JSON.stringify(event);
  for (const userId of userIds) {
    const sockets = connections.get(userId);
    if (!sockets) continue;
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}
