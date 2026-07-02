-- User: ban with a reason and an optional expiry (§14). banUntil = NULL means
-- a permanent ban; expired temp bans are lifted lazily by the admin read paths.
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;
ALTER TABLE "User" ADD COLUMN "banUntil" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- Chat reports moderation queue (§14). Plain string ids (no FK) like
-- CollusionFlag so reports survive account erasure.
CREATE TABLE "ChatReport" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "targetSeat" INTEGER,
    "text" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatReport_status_createdAt_idx" ON "ChatReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChatReport_matchId_idx" ON "ChatReport"("matchId");

-- CreateIndex
CREATE INDEX "ChatReport_fromUserId_idx" ON "ChatReport"("fromUserId");
