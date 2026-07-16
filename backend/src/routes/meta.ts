import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const router = Router();

router.use(authenticate, authorize("user:manage"));

router.get("/roles", async (_req, res, next) => {
  try {
    res.json(await prisma.role.findMany({ orderBy: { name: "asc" } }));
  } catch (err) {
    next(err);
  }
});

router.get("/departments", async (_req, res, next) => {
  try {
    res.json(await prisma.department.findMany({ orderBy: { name: "asc" } }));
  } catch (err) {
    next(err);
  }
});

export default router;
