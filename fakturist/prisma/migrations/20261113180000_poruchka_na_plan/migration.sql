-- Поръчка на план (SPEC 49–50): планът, периодът, основата и ДДС, референцията и фактурата. Само добавя.
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "interval" "BillingInterval",
ADD COLUMN     "invoiceDocumentId" TEXT,
ADD COLUMN     "netCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "planCode" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "vatCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatRate" TEXT NOT NULL DEFAULT '20';

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceDocumentId_key" ON "Payment"("invoiceDocumentId");

-- CreateIndex
CREATE INDEX "Payment_status_provider_idx" ON "Payment"("status", "provider");

-- CreateIndex
CREATE INDEX "Payment_createdById_idx" ON "Payment"("createdById");

-- CreateIndex
CREATE INDEX "Payment_confirmedById_idx" ON "Payment"("confirmedById");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceDocumentId_fkey" FOREIGN KEY ("invoiceDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AlterEnum: заменена/отказана поръчка (ако все пак се плати — активира се, не се губи).
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';
