-- v50 — Server Season: сезонна игра на ниво сървър (docs/GAME_CONCEPT.md).
-- Нива/XP + искри + магазин (етап 1), спътници (етап 2), куестове + trivia
-- (етап 3). Всички таблици са НОВИ (адитивна миграция; нищо съществуващо не се
-- пипа) и падат с каскада при изтриване на сървъра. Генерирано с
-- `prisma migrate diff --from-schema-datamodel <v49> --to-schema-datamodel <v50>`.

-- CreateTable
CREATE TABLE "game_settings" (
    "serverId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "xpPerMessage" INTEGER NOT NULL DEFAULT 15,
    "messageCooldownSec" INTEGER NOT NULL DEFAULT 60,
    "xpPerVoiceMinute" INTEGER NOT NULL DEFAULT 5,
    "announceChannelId" TEXT,
    "levelUpMessage" BOOLEAN NOT NULL DEFAULT true,
    "levelRoles" JSONB NOT NULL DEFAULT '[]',
    "dailySparks" INTEGER NOT NULL DEFAULT 50,
    "spawnEnabled" BOOLEAN NOT NULL DEFAULT true,
    "spawnChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "countingChannelId" TEXT,
    "countingCurrent" INTEGER NOT NULL DEFAULT 0,
    "countingHigh" INTEGER NOT NULL DEFAULT 0,
    "countingLastUserId" TEXT,
    "triviaChannelId" TEXT,
    "triviaSchedule" TEXT,
    "questChannelId" TEXT,
    "questEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_settings_pkey" PRIMARY KEY ("serverId")
);

-- CreateTable
CREATE TABLE "member_progress" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "seasonXp" INTEGER NOT NULL DEFAULT 0,
    "sparks" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastDailyAt" TIMESTAMP(3),
    "lastMessageXpAt" TIMESTAMP(3),
    "messages" INTEGER NOT NULL DEFAULT 0,
    "voiceMinutes" INTEGER NOT NULL DEFAULT 0,
    "activeCompanionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_xp_grants" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_xp_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_items" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceSparks" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ROLE',
    "roleId" TEXT,
    "durationDays" INTEGER,
    "stock" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_purchases" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "priceSparks" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_companions" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companionId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "fed" INTEGER NOT NULL DEFAULT 0,
    "nickname" TEXT,
    "seasonId" TEXT,
    "caughtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_companions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_spawns" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "companionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "caughtById" TEXT,
    "caughtAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_spawns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_trades" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "fromCompanionId" TEXT NOT NULL,
    "toCompanionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "companion_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_quests" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "rewardSparks" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_contributions" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quest_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trivia_rounds" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "questionId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BANK',
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "answer" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "winnerId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trivia_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trivia_answers" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "option" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trivia_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_progress_serverId_xp_idx" ON "member_progress"("serverId", "xp");

-- CreateIndex
CREATE INDEX "member_progress_serverId_sparks_idx" ON "member_progress"("serverId", "sparks");

-- CreateIndex
CREATE INDEX "member_progress_userId_idx" ON "member_progress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_progress_serverId_userId_key" ON "member_progress"("serverId", "userId");

-- CreateIndex
CREATE INDEX "game_xp_grants_userId_idx" ON "game_xp_grants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "game_xp_grants_serverId_userId_key_key" ON "game_xp_grants"("serverId", "userId", "key");

-- CreateIndex
CREATE INDEX "shop_items_serverId_idx" ON "shop_items"("serverId");

-- CreateIndex
CREATE INDEX "shop_purchases_serverId_userId_idx" ON "shop_purchases"("serverId", "userId");

-- CreateIndex
CREATE INDEX "shop_purchases_expiresAt_idx" ON "shop_purchases"("expiresAt");

-- CreateIndex
CREATE INDEX "shop_purchases_userId_idx" ON "shop_purchases"("userId");

-- CreateIndex
CREATE INDEX "member_companions_serverId_userId_idx" ON "member_companions"("serverId", "userId");

-- CreateIndex
CREATE INDEX "member_companions_serverId_companionId_idx" ON "member_companions"("serverId", "companionId");

-- CreateIndex
CREATE INDEX "member_companions_userId_idx" ON "member_companions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "companion_spawns_messageId_key" ON "companion_spawns"("messageId");

-- CreateIndex
CREATE INDEX "companion_spawns_serverId_createdAt_idx" ON "companion_spawns"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "companion_spawns_caughtById_idx" ON "companion_spawns"("caughtById");

-- CreateIndex
CREATE INDEX "companion_trades_serverId_status_idx" ON "companion_trades"("serverId", "status");

-- CreateIndex
CREATE INDEX "companion_trades_fromUserId_idx" ON "companion_trades"("fromUserId");

-- CreateIndex
CREATE INDEX "companion_trades_toUserId_idx" ON "companion_trades"("toUserId");

-- CreateIndex
CREATE INDEX "server_quests_serverId_status_idx" ON "server_quests"("serverId", "status");

-- CreateIndex
CREATE INDEX "server_quests_endsAt_idx" ON "server_quests"("endsAt");

-- CreateIndex
CREATE INDEX "quest_contributions_userId_idx" ON "quest_contributions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "quest_contributions_questId_userId_key" ON "quest_contributions"("questId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "trivia_rounds_messageId_key" ON "trivia_rounds"("messageId");

-- CreateIndex
CREATE INDEX "trivia_rounds_serverId_closedAt_idx" ON "trivia_rounds"("serverId", "closedAt");

-- CreateIndex
CREATE INDEX "trivia_rounds_expiresAt_idx" ON "trivia_rounds"("expiresAt");

-- CreateIndex
CREATE INDEX "trivia_answers_userId_idx" ON "trivia_answers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "trivia_answers_roundId_userId_key" ON "trivia_answers"("roundId", "userId");

-- AddForeignKey
ALTER TABLE "game_settings" ADD CONSTRAINT "game_settings_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_progress" ADD CONSTRAINT "member_progress_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_xp_grants" ADD CONSTRAINT "game_xp_grants_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "shop_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_companions" ADD CONSTRAINT "member_companions_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_spawns" ADD CONSTRAINT "companion_spawns_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_trades" ADD CONSTRAINT "companion_trades_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_quests" ADD CONSTRAINT "server_quests_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_contributions" ADD CONSTRAINT "quest_contributions_questId_fkey" FOREIGN KEY ("questId") REFERENCES "server_quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trivia_rounds" ADD CONSTRAINT "trivia_rounds_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trivia_answers" ADD CONSTRAINT "trivia_answers_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "trivia_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

