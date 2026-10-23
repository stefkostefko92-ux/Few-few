-- v53 — статистики и битки на спътниците: нивата на четирите статистики и
-- рекордът на всеки спътник, „не ме нападай“ на играча, превключвател на
-- сървъра и таблица с битките (одит + охлаждания). Адитивна миграция —
-- нищо съществуващо не се пипа; новите колони имат подразбиране.

-- AlterTable
ALTER TABLE "game_settings" ADD COLUMN     "battlesEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "member_progress" ADD COLUMN     "pvpOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "member_companions" ADD COLUMN     "atkLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hpLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "losses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "spdLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wins" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "companion_battles" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "defenderId" TEXT NOT NULL,
    "attackerOwnedId" TEXT NOT NULL,
    "defenderOwnedId" TEXT NOT NULL,
    "attackerCompanionId" TEXT NOT NULL,
    "defenderCompanionId" TEXT NOT NULL,
    "attackerStats" JSONB NOT NULL,
    "defenderStats" JSONB NOT NULL,
    "attackerWon" BOOLEAN NOT NULL,
    "turns" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "rewardSparks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_battles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companion_battles_serverId_attackerId_createdAt_idx" ON "companion_battles"("serverId", "attackerId", "createdAt");

-- CreateIndex
CREATE INDEX "companion_battles_serverId_defenderId_createdAt_idx" ON "companion_battles"("serverId", "defenderId", "createdAt");

-- CreateIndex
CREATE INDEX "companion_battles_attackerId_idx" ON "companion_battles"("attackerId");

-- CreateIndex
CREATE INDEX "companion_battles_defenderId_idx" ON "companion_battles"("defenderId");

-- CreateIndex
CREATE INDEX "companion_battles_createdAt_idx" ON "companion_battles"("createdAt");

-- AddForeignKey
ALTER TABLE "companion_battles" ADD CONSTRAINT "companion_battles_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

