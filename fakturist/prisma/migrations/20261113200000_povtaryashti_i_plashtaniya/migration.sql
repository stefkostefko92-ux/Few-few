-- Повтарящи се фактури, плащания по документ и напомняния (SPEC 51–52). Само добавя.
-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "DocumentPaymentState" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "DocumentPaymentSource" AS ENUM ('MANUAL', 'BANK');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "paidAt" DATE,
ADD COLUMN     "paidCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "paymentState" "DocumentPaymentState" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "recurringId" TEXT,
ADD COLUMN     "recurringPeriod" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RecurringInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "name" TEXT NOT NULL,
    "template" JSONB NOT NULL,
    "frequency" "RecurringFrequency" NOT NULL,
    "anchorDay" INTEGER NOT NULL,
    "nextRunOn" DATE NOT NULL,
    "endOn" DATE,
    "dueDays" INTEGER,
    "sendTo" TEXT,
    "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastIssuedOn" DATE,
    "lastError" TEXT,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "viaFirmId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPayment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "paidOn" DATE NOT NULL,
    "source" "DocumentPaymentSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "sentOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringInvoice_status_nextRunOn_idx" ON "RecurringInvoice"("status", "nextRunOn");

-- CreateIndex
CREATE INDEX "RecurringInvoice_organizationId_idx" ON "RecurringInvoice"("organizationId");

-- CreateIndex
CREATE INDEX "RecurringInvoice_seriesId_idx" ON "RecurringInvoice"("seriesId");

-- CreateIndex
CREATE INDEX "RecurringInvoice_createdById_idx" ON "RecurringInvoice"("createdById");

-- CreateIndex
CREATE INDEX "RecurringInvoice_viaFirmId_idx" ON "RecurringInvoice"("viaFirmId");

-- CreateIndex
CREATE INDEX "DocumentPayment_documentId_idx" ON "DocumentPayment"("documentId");

-- CreateIndex
CREATE INDEX "DocumentPayment_createdById_idx" ON "DocumentPayment"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReminder_documentId_step_key" ON "PaymentReminder"("documentId", "step");

-- CreateIndex
CREATE INDEX "Document_organizationId_paymentState_dueDate_idx" ON "Document"("organizationId", "paymentState", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Document_recurringId_recurringPeriod_key" ON "Document"("recurringId", "recurringPeriod");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "DocumentSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_viaFirmId_fkey" FOREIGN KEY ("viaFirmId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPayment" ADD CONSTRAINT "DocumentPayment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPayment" ADD CONSTRAINT "DocumentPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

