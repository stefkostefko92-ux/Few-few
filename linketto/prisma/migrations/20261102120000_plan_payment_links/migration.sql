-- Връзка план ↔ плащане (спецификация на Продавача, 02.11.2026): refund/спор
-- на плащането за план сваля плана само по ЗАПИСАН ключ (PaymentIntent за
-- FOUNDER, абонамент за PRO/BUSINESS), никога по customer. Рефералът пази
-- плащането, което го е породило, за сторно. Адитивно: само nullable колони,
-- без default и без промяна на съществуващи редове. Заварените записи се
-- попълват от scripts/backfill-plan-links.ts (по подразбиране --dry-run).
ALTER TABLE "User" ADD COLUMN "planPaymentIntentId" TEXT;
ALTER TABLE "User" ADD COLUMN "planSubscriptionId" TEXT;
ALTER TABLE "User" ADD COLUMN "planRevokedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "planRevokedReason" TEXT;
-- Оспореното плащане по плановия абонамент: възобновяване/възстановяване
-- само при събитие по същото плащане (друго успешно плащане не отменя спора).
ALTER TABLE "User" ADD COLUMN "planDisputedPaymentIntentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_planPaymentIntentId_key" ON "User"("planPaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_planSubscriptionId_key" ON "User"("planSubscriptionId");

ALTER TABLE "Referral" ADD COLUMN "stripePaymentIntentId" TEXT;
ALTER TABLE "Referral" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "Referral" ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "Referral" ADD COLUMN "clawbackPayoutId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Referral_stripePaymentIntentId_key" ON "Referral"("stripePaymentIntentId");
