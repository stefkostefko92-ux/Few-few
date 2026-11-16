-- Дневник за покупките: правото на данъчен кредит и месецът на включване на входящата фактура — адитивно.
-- CreateEnum
CREATE TYPE "VatCredit" AS ENUM ('FULL', 'PARTIAL', 'NONE');

-- AlterTable
ALTER TABLE "IncomingInvoice" ADD COLUMN     "journalPeriod" TEXT,
ADD COLUMN     "vatCredit" "VatCredit" NOT NULL DEFAULT 'FULL';

-- CreateIndex
CREATE INDEX "IncomingInvoice_organizationId_journalPeriod_idx" ON "IncomingInvoice"("organizationId", "journalPeriod");

-- CreateIndex
CREATE INDEX "IncomingInvoice_organizationId_issueDate_idx" ON "IncomingInvoice"("organizationId", "issueDate");

