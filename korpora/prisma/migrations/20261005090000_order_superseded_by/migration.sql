-- AlterTable
ALTER TABLE "UpgradeRequest" ADD COLUMN     "supersededById" TEXT;

-- CreateIndex
CREATE INDEX "UpgradeRequest_supersededById_idx" ON "UpgradeRequest"("supersededById");

-- AddForeignKey
ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "UpgradeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

