import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { VAPID_PUBLIC_KEY } from "../lib/push";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

router.get("/public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

const subscriptionSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

router.post("/subscribe", authenticate, async (req, res, next) => {
  try {
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Dữ liệu subscription không hợp lệ");
    }
    const { endpoint, keys } = parsed.data;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.user!.id, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: req.user!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const unsubscribeSchema = z.object({ endpoint: z.string().min(1) });

router.delete("/subscribe", authenticate, async (req, res, next) => {
  try {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Thiếu endpoint");
    }
    await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
