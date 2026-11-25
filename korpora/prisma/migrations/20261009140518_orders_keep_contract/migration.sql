-- DropForeignKey
ALTER TABLE "UpgradeRequest" DROP CONSTRAINT "UpgradeRequest_userId_fkey";

-- AlterTable
ALTER TABLE "UpgradeRequest" ADD COLUMN     "accountDeletedAt" TIMESTAMP(3),
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerName" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "UpgradeRequest_accountDeletedAt_idx" ON "UpgradeRequest"("accountDeletedAt");

-- AddForeignKey
ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
