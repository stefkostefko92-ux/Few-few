-- CreateEnum
CREATE TYPE "Framework" AS ENUM ('ESX', 'QBCORE', 'QBOX', 'OX_CORE', 'STANDALONE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProbeOutcome" AS ENUM ('ONLINE', 'OFFLINE', 'HIDDEN', 'UNREACHABLE');

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "cfxJoinCode" TEXT,
    "address" TEXT,
    "discordUrl" TEXT,
    "websiteUrl" TEXT,
    "bannerUrl" TEXT,
    "framework" "Framework" NOT NULL DEFAULT 'UNKNOWN',
    "whitelist" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'bg',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "featuredUntil" TIMESTAMP(3),
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastProbe" "ProbeOutcome" NOT NULL DEFAULT 'OFFLINE',
    "players" INTEGER NOT NULL DEFAULT 0,
    "maxPlayers" INTEGER NOT NULL DEFAULT 0,
    "lastOnlineAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerSnapshot" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "players" INTEGER NOT NULL,
    "online" BOOLEAN NOT NULL,

    CONSTRAINT "ServerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "authorAlias" TEXT,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "serverName" TEXT NOT NULL,
    "cfxJoinCode" TEXT,
    "address" TEXT,
    "discordUrl" TEXT,
    "contactEmail" TEXT NOT NULL,
    "note" TEXT,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "reporterEmail" TEXT NOT NULL,
    "goodFaith" BOOLEAN NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'Екипът на FiveM Bulgaria',
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Server_slug_key" ON "Server"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Server_cfxJoinCode_key" ON "Server"("cfxJoinCode");

-- CreateIndex
CREATE INDEX "Server_status_online_players_idx" ON "Server"("status", "online", "players");

-- CreateIndex
CREATE INDEX "Server_status_featuredUntil_idx" ON "Server"("status", "featuredUntil");

-- CreateIndex
CREATE INDEX "ServerSnapshot_serverId_at_idx" ON "ServerSnapshot"("serverId", "at");

-- CreateIndex
CREATE INDEX "Review_serverId_status_idx" ON "Review"("serverId", "status");

-- CreateIndex
CREATE INDEX "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_publishedAt_idx" ON "Post"("publishedAt");

-- AddForeignKey
ALTER TABLE "ServerSnapshot" ADD CONSTRAINT "ServerSnapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
