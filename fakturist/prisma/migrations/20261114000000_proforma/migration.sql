-- Проформа фактура (решение на собственика, 13.11.2026): не е данъчен документ — своя номерация,
-- без веригата и дневниците. Само добавя.
-- CreateEnum
CREATE TYPE "ProformaStatus" AS ENUM ('OPEN', 'INVOICED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "proformaNext" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Proforma" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ProformaStatus" NOT NULL DEFAULT 'OPEN',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEik" TEXT,
    "buyerEmail" TEXT,
    "taxExclusiveCents" BIGINT NOT NULL,
    "vatCents" BIGINT NOT NULL,
    "payableCents" BIGINT NOT NULL,
    "pdfLanguage" TEXT NOT NULL DEFAULT 'bg',
    "createdById" TEXT,
    "firmId" TEXT,
    "invoiceDocumentId" TEXT,
    "invoicedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Proforma_invoiceDocumentId_key" ON "Proforma"("invoiceDocumentId");

-- CreateIndex
CREATE INDEX "Proforma_organizationId_createdAt_idx" ON "Proforma"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Proforma_createdById_idx" ON "Proforma"("createdById");

-- CreateIndex
CREATE INDEX "Proforma_firmId_idx" ON "Proforma"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "Proforma_organizationId_number_key" ON "Proforma"("organizationId", "number");

-- AddForeignKey
ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_invoiceDocumentId_fkey" FOREIGN KEY ("invoiceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

