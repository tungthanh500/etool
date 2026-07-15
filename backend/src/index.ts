import express from "express";
import healthRouter from "./routes/health";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(express.json());
app.use("/api", healthRouter);

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
