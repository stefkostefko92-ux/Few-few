-- Бутон за отказ (чл. 11а Дир. 2011/83, изм. 2023/2673), мотиви при бан (DSA чл. 17),
-- проверка на собствен домейн (TXT) и кликове по продукт. Само добавяне на nullable
-- колони + индекс; заварени собствени домейни се сервират едва след проверка.

-- AlterTable
ALTER TABLE "ClickEvent" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "PlanOrder" ADD COLUMN     "withdrawalName" TEXT,
ADD COLUMN     "withdrawalRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "bannedCategory" TEXT,
ADD COLUMN     "bannedReason" TEXT,
ADD COLUMN     "domainToken" TEXT,
ADD COLUMN     "domainVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ClickEvent_productId_createdAt_idx" ON "ClickEvent"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

