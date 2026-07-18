-- DropForeignKey
ALTER TABLE "WorkflowStep" DROP CONSTRAINT "WorkflowStep_approverUserId_fkey";

-- DropForeignKey
ALTER TABLE "WorkflowStep" DROP CONSTRAINT "WorkflowStep_departmentId_fkey";

-- AlterTable
ALTER TABLE "DocumentLog" ADD COLUMN     "meta" JSONB;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
