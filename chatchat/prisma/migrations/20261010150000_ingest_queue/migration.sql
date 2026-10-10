-- Пакетното приемане на документи през опашката (§4.1, §7.3, NFR-06): IngestBatch + IngestItem.
-- Само адитивно: нов enum, две таблици, индекси на всеки външен ключ и на (tenantId, status).

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "IngestBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "defaults" JSONB NOT NULL,
    "manifest" JSONB,
    "importErrorCodes" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "attachmentId" TEXT,
    "fileName" TEXT NOT NULL,
    "meta" JSONB NOT NULL,
    "status" "IngestStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "format" TEXT,
    "errorCode" TEXT,
    "warnings" JSONB,
    "documentId" TEXT,
    "chunks" INTEGER,
    "pages" INTEGER,
    "ocrPages" INTEGER,
    "errorCodes" INTEGER,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IngestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestBatch_tenantId_createdAt_idx" ON "IngestBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "IngestBatch_createdById_idx" ON "IngestBatch"("createdById");

-- CreateIndex
CREATE INDEX "IngestItem_tenantId_status_idx" ON "IngestItem"("tenantId", "status");

-- CreateIndex
CREATE INDEX "IngestItem_batchId_idx" ON "IngestItem"("batchId");

-- CreateIndex
CREATE INDEX "IngestItem_attachmentId_idx" ON "IngestItem"("attachmentId");

-- CreateIndex
CREATE INDEX "IngestItem_documentId_idx" ON "IngestItem"("documentId");

-- AddForeignKey
ALTER TABLE "IngestBatch" ADD CONSTRAINT "IngestBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestItem" ADD CONSTRAINT "IngestItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestItem" ADD CONSTRAINT "IngestItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestItem" ADD CONSTRAINT "IngestItem_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestItem" ADD CONSTRAINT "IngestItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

