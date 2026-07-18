import type { Request } from "express";
import { prisma } from "./prisma";

export type AuditCategory = "AUTH" | "DOCUMENT" | "USER" | "WORKFLOW" | "FILE";

interface AuditInput {
  req?: Request;
  category: AuditCategory;
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
}

// Lấy IP client — ưu tiên x-forwarded-for (khi sau proxy), fallback req.ip.
function clientIp(req?: Request): string | null {
  if (!req) return null;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]!.trim();
  return req.ip ?? null;
}

// Ghi nhật ký kiểm toán — fire-and-forget: lỗi ghi log KHÔNG được làm sập
// luồng nghiệp vụ (mirror cách notifications.ts nuốt lỗi). Không await trong
// transaction nghiệp vụ để audit hỏng không kéo theo rollback.
export function audit(input: AuditInput): void {
  const { req, category, action, actorId, actorEmail, targetType, targetId, detail } = input;
  prisma.auditLog
    .create({
      data: {
        category,
        action,
        actorId: actorId ?? req?.user?.id ?? null,
        actorEmail: actorEmail ?? req?.user?.email ?? null,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        detail: detail ?? null,
        ip: clientIp(req),
      },
    })
    .catch((err) => {
      console.error("Ghi audit log thất bại:", err);
    });
}
