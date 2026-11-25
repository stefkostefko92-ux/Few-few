-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "createdByFirmId" TEXT;

-- CreateIndex
CREATE INDEX "Organization_createdByFirmId_idx" ON "Organization"("createdByFirmId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdByFirmId_fkey" FOREIGN KEY ("createdByFirmId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
