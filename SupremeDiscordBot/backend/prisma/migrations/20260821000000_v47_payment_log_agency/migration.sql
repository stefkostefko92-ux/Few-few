-- Agency приходите липсваха във финансовия регистър: `invoice.paid` правеше `break`
-- в agency клона ПРЕДИ записа в payment_logs, а calculateMRR() (routes/admin.js)
-- агрегира точно тази таблица.
--
-- Промяната е АДИТИВНА и не пипа съществуващи редове:
--   · "serverId" става NULLABLE — всички налични редове имат стойност, нищо не се губи;
--   · добавя се nullable "agencyId" + индекс + FK към agencies.
--
-- Инвариантът „точно едно от двете е попълнено" се пази в кода (единствените писачи
-- са routes/stripe.js и routes/admin.js) и е покрит с тест — Prisma не може да го
-- изрази декларативно.
--
-- ВНИМАНИЕ за имената: колоните на тази таблица са camelCase ("serverId"), не
-- snake_case — само ТАБЛИЦАТА е преименувана през @@map. Първата версия на тази
-- миграция ползваше "server_id" и щеше да гръмне на живо.

ALTER TABLE "payment_logs" ALTER COLUMN "serverId" DROP NOT NULL;
ALTER TABLE "payment_logs" ADD COLUMN "agencyId" TEXT;

CREATE INDEX "payment_logs_agencyId_idx" ON "payment_logs"("agencyId");

ALTER TABLE "payment_logs"
  ADD CONSTRAINT "payment_logs_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
