-- Прекратяване на фирма (SPEC 65–67): заявката и срокът за изтриване — адитивно.
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "purgeAfter" TIMESTAMP(3),
ADD COLUMN     "terminatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Organization_purgeAfter_idx" ON "Organization"("purgeAfter");

