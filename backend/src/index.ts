import express from "express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import documentsRouter from "./routes/documents";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(express.json());
app.use(cookieParser());
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/documents", documentsRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Đã xảy ra lỗi máy chủ" });
});

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
