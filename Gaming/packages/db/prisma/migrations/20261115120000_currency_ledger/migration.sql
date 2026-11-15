-- Икономика: регистър на движенията на валутата, балансите никога под 0,
-- покупка и без ред в Product, clawback от реално начисленото, един дневен
-- бонус на ден (DailyClaim). САМО добавя
-- (нови типове/таблица/колони, DROP NOT NULL, CHECK) — нищо не се трие.
-- Генерирано с `prisma migrate diff --from-schema-datamodel <стара> --to-schema-datamodel
-- prisma/schema.prisma --script`; backfill-ът и CHECK-овете са ръчни (Prisma не ги моделира).

-- Fail-closed ПРЕДИ всяка промяна: при отрицателен баланс (стария clawback без
-- пазач) миграцията отказва веднага и базата остава непипната — без половин
-- миграция. НЕ поправяме пари мълчаливо; корекцията (до 0 + ред в регистъра)
-- се решава от човек. Проверка преди deploy:
--   SELECT id, chips, gems FROM "User" WHERE chips < 0 OR gems < 0;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "chips" < 0 OR "gems" < 0) THEN
    RAISE EXCEPTION 'currency_ledger: има потребители с отрицателен баланс (chips/gems < 0) — миграцията отказва преди промени; виж SELECT в коментара';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "CurrencyKind" AS ENUM ('CHIPS', 'GEMS');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('PURCHASE', 'VIP_STIPEND', 'REFUND', 'DISPUTE', 'CLAWBACK', 'ADMIN', 'DAILY', 'QUEST', 'ACHIEVEMENT', 'MATCH', 'SHOP');

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "grantedChips" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "grantedGems" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentIntentId" TEXT,
ADD COLUMN     "sku" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- Backfill на старите редове от текущия продукт — най-доброто налично
-- приближение (реално начисленото не е записвано; досегашният админ clawback
-- ползваше същите стойности). Само завършени — само те подлежат на clawback.
UPDATE "Purchase" p
SET "sku" = pr."sku",
    "grantedGems" = CASE WHEN pr."kind" = 'VIP_SUB' THEN 0 ELSE COALESCE(pr."gems", 0) END,
    "grantedChips" = CASE WHEN pr."kind" = 'VIP_SUB' THEN 0 ELSE COALESCE(pr."chips", 0) END
FROM "Product" pr
WHERE pr."id" = p."productId" AND p."status" = 'completed';

UPDATE "Purchase" p
SET "sku" = pr."sku"
FROM "Product" pr
WHERE pr."id" = p."productId" AND p."sku" IS NULL;

-- CreateTable
CREATE TABLE "CurrencyLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "CurrencyKind" NOT NULL,
    "delta" BIGINT NOT NULL,
    "shortfall" BIGINT NOT NULL DEFAULT 0,
    "reason" "LedgerReason" NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyLedger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CurrencyLedger_shortfall_check" CHECK ("shortfall" >= 0)
);

-- CreateTable — един дневен бонус на играч на UTC ден (идемпотентност в базата).
CREATE TABLE "DailyClaim" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyClaim_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "CurrencyLedger_userId_createdAt_idx" ON "CurrencyLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CurrencyLedger_refId_idx" ON "CurrencyLedger"("refId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_paymentIntentId_key" ON "Purchase"("paymentIntentId");

-- AddForeignKey
ALTER TABLE "CurrencyLedger" ADD CONSTRAINT "CurrencyLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClaim" ADD CONSTRAINT "DailyClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Балансите никога под 0 (последна защита под условните дебити в кода).
-- Отрицателните са отказани от проверката най-горе, затова тук CHECK минава.
ALTER TABLE "User" ADD CONSTRAINT "User_chips_nonnegative" CHECK ("chips" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_gems_nonnegative" CHECK ("gems" >= 0);
