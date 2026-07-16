import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Không dùng router.use(...) chung cho cả router — router này được mount ở tiền tố
// rộng "/api", nếu áp middleware không giới hạn path thì nó sẽ chặn nhầm mọi request
// "/api/*" khác được đăng ký sau nó (ví dụ /api/push/*) do Express so khớp theo tiền tố.
router.get("/roles", authenticate, authorize("user:manage"), async (_req, res, next) => {
  try {
    res.json(await prisma.role.findMany({ orderBy: { name: "asc" } }));
  } catch (err) {
    next(err);
  }
});

router.get("/departments", authenticate, authorize("user:manage"), async (_req, res, next) => {
  try {
    res.json(await prisma.department.findMany({ orderBy: { name: "asc" } }));
  } catch (err) {
    next(err);
  }
});

export default router;
