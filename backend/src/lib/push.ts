import webpush from "web-push";
import { prisma } from "./prisma";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

export const VAPID_PUBLIC_KEY = requireEnv("VAPID_PUBLIC_KEY");

webpush.setVapidDetails("mailto:admin@example.com", VAPID_PUBLIC_KEY, requireEnv("VAPID_PRIVATE_KEY"));

export async function sendPushToUsers(userIds: string[], payload: Record<string, unknown>): Promise<void> {
  if (userIds.length === 0) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription hết hạn/bị thu hồi phía trình duyệt — dọn luôn để tránh tích rác.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          console.error(`Lỗi gửi push tới subscription ${sub.id}:`, err);
        }
      }
    }),
  );
}
