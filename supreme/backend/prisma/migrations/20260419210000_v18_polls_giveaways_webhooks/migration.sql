-- Migration: v1.8 — Polls, Giveaways, Scheduled & Sticky messages, Webhooks
-- Fully idempotent.

-- ─── POLLS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "polls" (
  "id"          TEXT NOT NULL,
  "serverId"    TEXT NOT NULL,
  "creatorId"   TEXT NOT NULL,
  "channelId"   TEXT NOT NULL,
  "messageId"   TEXT,
  "question"    TEXT NOT NULL,
  "options"     TEXT[] NOT NULL DEFAULT '{}',
  "multiChoice" BOOLEAN NOT NULL DEFAULT false,
  "anonymous"   BOOLEAN NOT NULL DEFAULT false,
  "closesAt"    TIMESTAMP(3),
  "closedAt"    TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "poll_votes" (
  "id"        TEXT NOT NULL,
  "pollId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "option"    INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pollId_fkey"
    FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "poll_votes_pollId_userId_option_key"
  ON "poll_votes"("pollId", "userId", "option");
CREATE INDEX IF NOT EXISTS "poll_votes_pollId_idx" ON "poll_votes"("pollId");

-- ─── GIVEAWAYS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "giveaways" (
  "id"              TEXT NOT NULL,
  "serverId"        TEXT NOT NULL,
  "creatorId"       TEXT NOT NULL,
  "channelId"       TEXT NOT NULL,
  "messageId"       TEXT,
  "prize"           TEXT NOT NULL,
  "description"     TEXT,
  "winnerCount"     INTEGER NOT NULL DEFAULT 1,
  "endsAt"          TIMESTAMP(3) NOT NULL,
  "endedAt"         TIMESTAMP(3),
  "winnerIds"       TEXT[] NOT NULL DEFAULT '{}',
  "requiredRoleIds" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "giveaways_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "giveaways_endsAt_endedAt_idx" ON "giveaways"("endsAt", "endedAt");

CREATE TABLE IF NOT EXISTS "giveaway_entries" (
  "id"         TEXT NOT NULL,
  "giveawayId" TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "giveaway_entries_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "giveaway_entries_giveawayId_userId_key"
  ON "giveaway_entries"("giveawayId", "userId");

-- ─── SCHEDULED MESSAGES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "scheduled_messages" (
  "id"               TEXT NOT NULL,
  "serverId"         TEXT NOT NULL,
  "channelId"        TEXT NOT NULL,
  "content"          TEXT NOT NULL,
  "embedTitle"       TEXT,
  "embedDescription" TEXT,
  "embedColor"       TEXT NOT NULL DEFAULT '#00e5ff',
  "sendAt"           TIMESTAMP(3) NOT NULL,
  "recurrence"       TEXT,
  "sentAt"           TIMESTAMP(3),
  "nextAt"           TIMESTAMP(3),
  "createdBy"        TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "scheduled_messages_sendAt_sentAt_idx" ON "scheduled_messages"("sendAt", "sentAt");
CREATE INDEX IF NOT EXISTS "scheduled_messages_nextAt_idx" ON "scheduled_messages"("nextAt");

-- ─── STICKY MESSAGES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sticky_messages" (
  "id"               TEXT NOT NULL,
  "serverId"         TEXT NOT NULL,
  "channelId"        TEXT NOT NULL,
  "content"          TEXT NOT NULL,
  "embedTitle"       TEXT,
  "embedColor"       TEXT NOT NULL DEFAULT '#00e5ff',
  "currentMessageId" TEXT,
  "enabled"          BOOLEAN NOT NULL DEFAULT true,
  "createdBy"        TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sticky_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sticky_messages_channelId_key" ON "sticky_messages"("channelId");

-- ─── WEBHOOKS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "webhooks" (
  "id"             TEXT NOT NULL,
  "serverId"       TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "url"            TEXT NOT NULL,
  "secret"         TEXT,
  "enabled"        BOOLEAN NOT NULL DEFAULT true,
  "events"         TEXT[] NOT NULL DEFAULT '{}',
  "lastDeliveryAt" TIMESTAMP(3),
  "lastStatus"     INTEGER,
  "failCount"      INTEGER NOT NULL DEFAULT 0,
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "webhooks_serverId_enabled_idx" ON "webhooks"("serverId", "enabled");
