import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Hộp thông báo của tôi: 30 bản ghi mới nhất + tổng số chưa đọc (badge chuông).
router.get("/", authenticate, async (req, res, next) => {
  try {
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
    ]);
    res.json({ items, unreadCount });
  } catch (err) {
    next(err);
  }
});

// Đánh dấu đã đọc toàn bộ — gọi khi người dùng mở panel chuông.
router.post("/read-all", authenticate, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
