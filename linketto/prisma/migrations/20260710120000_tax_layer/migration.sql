-- Данъчен слой (deemed supplier, чл. 9а Регл. 282/2011 — виж TAX.md):
-- ДДС/нето/държава на купувача за OSS записите + превод към продавача
-- (separate charges & transfers) + непрекъсната номерация на документа
-- за продажба (Наредба Н-18).
ALTER TABLE "Purchase" ADD COLUMN "vatAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN "netAmountCents" INTEGER;
ALTER TABLE "Purchase" ADD COLUMN "buyerCountry" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "stripeTransferId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "receiptNumber" SERIAL NOT NULL;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_receiptNumber_key" UNIQUE ("receiptNumber");
