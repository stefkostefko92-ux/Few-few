-- CreateEnum
CREATE TYPE "StreamPlatform" AS ENUM ('TWITCH', 'KICK', 'YOUTUBE', 'TIKTOK');

-- CreateTable
CREATE TABLE "Streamer" (
    "id" TEXT NOT NULL,
    "platform" "StreamPlatform" NOT NULL,
    "channel" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "language" TEXT,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "live" BOOLEAN NOT NULL DEFAULT false,
    "viewers" INTEGER NOT NULL DEFAULT 0,
    "streamTitle" TEXT,
    "lastLiveAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Streamer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Streamer_platform_channel_key" ON "Streamer"("platform", "channel");

-- CreateIndex
CREATE INDEX "Streamer_status_live_viewers_idx" ON "Streamer"("status", "live", "viewers");
