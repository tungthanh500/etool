-- CreateTable
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Delegation_fromUserId_idx" ON "Delegation"("fromUserId");

-- CreateIndex
CREATE INDEX "Delegation_toUserId_idx" ON "Delegation"("toUserId");

-- CreateIndex
CREATE INDEX "Delegation_toUserId_startDate_endDate_idx" ON "Delegation"("toUserId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
