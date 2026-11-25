-- Опашката за отчитане към НАП (SPEC 63). Само добавя; нищо не се праща до API на НАП.
-- CreateEnum
CREATE TYPE "NraReportStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "NraReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "ublSha256" TEXT NOT NULL,
    "status" "NraReportStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NraReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NraReport_documentId_key" ON "NraReport"("documentId");

-- CreateIndex
CREATE INDEX "NraReport_status_createdAt_idx" ON "NraReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NraReport_organizationId_createdAt_idx" ON "NraReport"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "NraReport" ADD CONSTRAINT "NraReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

