-- Thêm cột username làm tên đăng nhập (thay email). Viết tay thay vì để Prisma sinh
-- vì bảng đã có dữ liệu: phải backfill trước khi khoá NOT NULL — Prisma sinh thẳng
-- ADD COLUMN NOT NULL sẽ fail trên 5 dòng có sẵn.
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill: lấy phần trước @ của email (staff@example.com -> staff). Dữ liệu hiện tại
-- đã kiểm tra không trùng phần local-part.
UPDATE "User" SET "username" = split_part("email", '@', 1);

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
