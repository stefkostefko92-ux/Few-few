-- Ръчно даден план от мастъра (SPEC 71) — адитивно: признак, кой го е дал, причината.
-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "grantNote" TEXT,
ADD COLUMN     "granted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grantedById" TEXT;

-- CreateIndex
CREATE INDEX "Subscription_grantedById_idx" ON "Subscription"("grantedById");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

