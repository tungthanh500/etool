import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const router = Router();

const VALID_CATEGORIES = new Set(["AUTH", "DOCUMENT", "USER", "WORKFLOW", "FILE"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const ACTOR_SELECT = { id: true, fullName: true, email: true } as const;

router.get("/", authenticate, authorize("audit:read"), async (req, res, next) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    const where = category && VALID_CATEGORIES.has(category) ? { category } : {};

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: ACTOR_SELECT } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
});

export default router;
