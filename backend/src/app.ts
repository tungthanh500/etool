import express from "express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import multer from "multer";
import { Prisma } from "@prisma/client";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import documentsRouter from "./routes/documents";
import usersRouter from "./routes/users";
import departmentsRouter from "./routes/departments";
import rolesRouter from "./routes/roles";
import pushRouter from "./routes/push";
import workflowsRouter from "./routes/workflows";
import auditRouter from "./routes/audit";
import dashboardRouter from "./routes/dashboard";
import delegationsRouter from "./routes/delegations";
import notificationsRouter from "./routes/notifications";
import { AppError } from "./lib/errors";

const app = express();

// API thuần JSON (không render HTML) — dùng cấu hình mặc định của Helmet.
app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/users", usersRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/push", pushRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/delegations", delegationsRouter);
app.use("/api/notifications", notificationsRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }
  // P2025: điều kiện where (currentStep/status) không còn khớp — hồ sơ vừa bị
  // request khác xử lý trước (optimistic concurrency), không phải lỗi hệ thống.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    res.status(409).json({ error: "Văn bản vừa được người khác xử lý, vui lòng tải lại" });
    return;
  }
  if (err instanceof Error && err.message.startsWith("Chỉ chấp nhận")) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Đã xảy ra lỗi máy chủ" });
});

export default app;
