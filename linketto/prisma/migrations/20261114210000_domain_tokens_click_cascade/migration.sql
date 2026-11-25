-- (1) Заварените собствени домейни получават токен за TXT проверка — иначе изгасват
-- (/d/<домейн> показва само проверен) без начин да се проверят от таблото. Токенът
-- се публикува в DNS и не е тайна. (2) Кликовете на изтрит линк/продукт се трият
-- с него — иначе видът им (NULL колони) ги превръща в „прегледи“ в аналитиката.

UPDATE "Profile" SET "domainToken" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "customDomain" IS NOT NULL AND "domainToken" IS NULL;

-- DropForeignKey
ALTER TABLE "ClickEvent" DROP CONSTRAINT "ClickEvent_linkId_fkey";

-- DropForeignKey
ALTER TABLE "ClickEvent" DROP CONSTRAINT "ClickEvent_productId_fkey";

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- (3) Проследяване на потвърждението за отказ и на DSA бележката; предупреждение
-- преди спиране при леки нарушения (ОУ обещават предизвестие).
-- AlterTable
ALTER TABLE "PlanOrder" ADD COLUMN     "withdrawalAckSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "banNoticeSentAt" TIMESTAMP(3),
ADD COLUMN     "warnedAt" TIMESTAMP(3),
ADD COLUMN     "warnedCategory" TEXT,
ADD COLUMN     "warnedReason" TEXT;

