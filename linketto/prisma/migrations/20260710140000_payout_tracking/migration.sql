-- Проследяване на превода към продавача (одит на Продавача, TAX.md):
-- payoutFailedAt прави провален превод ВИДИМ (админ) и ретрайваем;
-- chargedOn разграничава заварените destination-charge покупки от новите
-- platform (separate charges & transfers) — refund пътищата са различни.
ALTER TABLE "Purchase" ADD COLUMN "payoutFailedAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "chargedOn" TEXT NOT NULL DEFAULT 'platform';
-- Всички съществуващи покупки са от destination-charge ерата.
UPDATE "Purchase" SET "chargedOn" = 'destination' WHERE "stripeTransferId" IS NULL;
