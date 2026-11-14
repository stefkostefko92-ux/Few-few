-- Дневник за покупките: правото на кредит и месецът и за документите от шкафчето — адитивно.
-- AlterTable
ALTER TABLE "InboxEntry" ADD COLUMN     "journalPeriod" TEXT,
ADD COLUMN     "vatCredit" "VatCredit" NOT NULL DEFAULT 'FULL';

-- CreateIndex
CREATE INDEX "InboxEntry_recipientOrgId_journalPeriod_idx" ON "InboxEntry"("recipientOrgId", "journalPeriod");

