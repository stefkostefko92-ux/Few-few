-- Злоупотреби и пари (docs/abuse-money-spec.md): пропорционално плащане при отказ,
-- задържане на рефералния бонус, лимит на рассылките. Адитивно.

-- AlterTable
ALTER TABLE "PlanOrder" ADD COLUMN     "immediateStartAt" TIMESTAMP(3),
ADD COLUMN     "immediateStartTerms" TEXT,
ADD COLUMN     "immediateStartText" TEXT,
ADD COLUMN     "refundCents" INTEGER,
ADD COLUMN     "refundVatCents" INTEGER,
ADD COLUMN     "withdrawalUsedSec" INTEGER;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "lastBroadcastAt" TIMESTAMP(3);

-- AlterTable
-- DEFAULT = „освободен“: докато тече миграцията (и при откат на кода) старият app създава бонуси
-- без releasedAt и ги кредитира веднага — те НЕ са задържани. Новият код подава null изрично.
ALTER TABLE "Referral" ADD COLUMN     "flaggedAt" TIMESTAMP(3),
ADD COLUMN     "releasedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Старите бонуси вече са в баланса (кредитирани при плащането) → „освободени“ тогава.
UPDATE "Referral" SET "releasedAt" = "createdAt";
