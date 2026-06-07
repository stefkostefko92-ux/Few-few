-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('spins', 'coins', 'spiritTokens', 'gems');

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spins" INTEGER NOT NULL DEFAULT 0,
    "coins" BIGINT NOT NULL DEFAULT 0,
    "spiritTokens" INTEGER NOT NULL DEFAULT 0,
    "gems" INTEGER NOT NULL DEFAULT 0,
    "spinsUpdatedAt" BIGINT NOT NULL DEFAULT 0,
    "shields" INTEGER NOT NULL DEFAULT 0,
    "currentIsland" INTEGER NOT NULL DEFAULT 0,
    "islands" JSONB NOT NULL,
    "pullsSinceEpic" INTEGER NOT NULL DEFAULT 0,
    "pullsSinceMythic" INTEGER NOT NULL DEFAULT 0,
    "companions" JSONB NOT NULL,
    "revengeTargets" JSONB NOT NULL,
    "clanId" TEXT,
    "pendingAttack" JSONB,
    "pendingRaid" JSONB,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerLeg" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "at" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "delta" BIGINT NOT NULL,

    CONSTRAINT "LedgerLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveOpsConfig" (
    "id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveOpsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "memberIds" JSONB NOT NULL,
    "currentWarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanWar" (
    "id" TEXT NOT NULL,
    "clanAId" TEXT NOT NULL,
    "clanBId" TEXT NOT NULL,
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClanWar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "transactionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "grants" JSONB NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("transactionId")
);

-- CreateTable
CREATE TABLE "Credential" (
    "playerId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("playerId")
);

-- CreateIndex
CREATE INDEX "Player_currentIsland_idx" ON "Player"("currentIsland");

-- CreateIndex
CREATE INDEX "LedgerLeg_txId_idx" ON "LedgerLeg"("txId");

-- CreateIndex
CREATE INDEX "LedgerLeg_account_currency_idx" ON "LedgerLeg"("account", "currency");

-- CreateIndex
CREATE INDEX "LedgerLeg_currency_idx" ON "LedgerLeg"("currency");

-- CreateIndex
CREATE INDEX "Clan_currentWarId_idx" ON "Clan"("currentWarId");

-- CreateIndex
CREATE INDEX "Purchase_playerId_productId_idx" ON "Purchase"("playerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_deviceId_key" ON "Credential"("deviceId");

