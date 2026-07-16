import express from "express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import { Prisma } from "@prisma/client";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import documentsRouter from "./routes/documents";
import { AppError } from "./lib/errors";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(express.json());
app.use(cookieParser());
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/documents", documentsRouter);

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
  if (err instanceof Error && err.message.startsWith("Chỉ chấp nhận file")) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Đã xảy ra lỗi máy chủ" });
});

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
