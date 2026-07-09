-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'REVIEWING', 'DISMISSED', 'CONFIRMED');

-- CreateTable
CREATE TABLE "CollusionFlag" (
    "id" TEXT NOT NULL,
    "game" "GameKey" NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "details" TEXT NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CollusionFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollusionFlag_status_game_idx" ON "CollusionFlag"("status", "game");

-- CreateIndex
CREATE INDEX "CollusionFlag_userAId_idx" ON "CollusionFlag"("userAId");

-- CreateIndex
CREATE INDEX "CollusionFlag_userBId_idx" ON "CollusionFlag"("userBId");
