-- Mục 5.6: thay "approverRole" (role-based) bằng mô hình vị trí trong luồng
-- (kind CREATOR_DEPT_HEAD | DEPARTMENT + departmentId + approverUserId tuỳ chọn).
-- Viết tay vì bảng đã có dữ liệu — Prisma không tự sinh được ADD COLUMN NOT NULL
-- trên bảng có sẵn dòng, và DROP COLUMN approverRole cần backfill trước.

ALTER TABLE "WorkflowStep" ADD COLUMN "kind" TEXT;
ALTER TABLE "WorkflowStep" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "WorkflowStep" ADD COLUMN "approverUserId" TEXT;

-- Dept_Head -> CREATOR_DEPT_HEAD (giữ đúng hành vi cũ: trưởng phòng cùng phòng ban người tạo).
UPDATE "WorkflowStep" SET "kind" = 'CREATOR_DEPT_HEAD' WHERE "approverRole" = 'Dept_Head';

-- Director/Accountant -> DEPARTMENT, đích danh ĐÚNG user đang giữ role đó tại thời điểm
-- migrate (giữ nguyên hành vi thực tế — nếu quy về "bất kỳ thành viên phòng ban" thì các
-- user khác cùng phòng, kể cả Admin, sẽ tự nhiên duyệt được -> sai lệch so với trước).
UPDATE "WorkflowStep" ws SET
  "kind" = 'DEPARTMENT',
  "departmentId" = u."departmentId",
  "approverUserId" = u.id
FROM "User" u
JOIN "Role" r ON r.id = u."roleId"
WHERE ws."approverRole" = 'Director' AND r.name = 'Director';

UPDATE "WorkflowStep" ws SET
  "kind" = 'DEPARTMENT',
  "departmentId" = u."departmentId",
  "approverUserId" = u.id
FROM "User" u
JOIN "Role" r ON r.id = u."roleId"
WHERE ws."approverRole" = 'Accountant' AND r.name = 'Accountant';

-- Fallback: bước role Accountant còn sót (không có user nào giữ role đó tại thời điểm
-- migrate -> trước đây bước này không ai duyệt được, không có hành vi cũ để giữ nguyên) ->
-- quy về phòng "Phòng Hành chính - Kế toán", bất kỳ thành viên nào (approverUserId NULL).
UPDATE "WorkflowStep" SET
  "kind" = 'DEPARTMENT',
  "departmentId" = (SELECT id FROM "Department" WHERE name = 'Phòng Hành chính - Kế toán')
WHERE "approverRole" = 'Accountant' AND "kind" IS NULL;

ALTER TABLE "WorkflowStep" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "WorkflowStep" DROP COLUMN "approverRole";

CREATE INDEX "WorkflowStep_departmentId_idx" ON "WorkflowStep"("departmentId");
CREATE INDEX "WorkflowStep_approverUserId_idx" ON "WorkflowStep"("approverUserId");

ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
