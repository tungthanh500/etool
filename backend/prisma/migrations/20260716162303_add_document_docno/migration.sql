-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "docNo" TEXT;

-- CreateTable
CREATE TABLE "DocCounter" (
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_docNo_key" ON "Document"("docNo");

