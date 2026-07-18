import path from "node:path";
import { config } from "dotenv";

// PHẢI chạy TRƯỚC khi bất kỳ module app nào import @prisma/client / lib/jwt.
// override:true để thắng cả khi shell đã có sẵn DATABASE_URL trỏ DB thật.
config({ path: path.join(__dirname, "..", ".env.test"), override: true });

// Rào an toàn: tuyệt đối không để test chạy nhầm vào DB thật (bài học sự cố seed R28).
if (!process.env.DATABASE_URL?.includes("eapproval_test")) {
  throw new Error(
    "DATABASE_URL không trỏ vào eapproval_test — dừng để không phá DB thật. Kiểm tra backend/.env.test.",
  );
}
