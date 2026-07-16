import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

// Stub xác minh middleware auth/RBAC ở Bước 2 — sẽ thay bằng CRUD thật ở Bước 3.
const router = Router();

router.get("/", authenticate, authorize("document:read:own"), (_req, res) => {
  res.json([]);
});

export default router;
