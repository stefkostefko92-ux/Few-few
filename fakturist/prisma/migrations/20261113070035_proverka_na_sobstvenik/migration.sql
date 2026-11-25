-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "ownerReviewPendingAt" TIMESTAMP(3),
ADD COLUMN     "ownershipLockedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Organization_ownerReviewPendingAt_idx" ON "Organization"("ownerReviewPendingAt");
