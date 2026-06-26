-- Migration: v1.7 — Verification module (anti-bot captcha before ticket opening)
-- Fully idempotent (safe to re-run).

-- ─── Panels: verification gate ───────────────────────────────────────────────
ALTER TABLE "panels"
  ADD COLUMN IF NOT EXISTS "requireVerifiedRoleIds"    TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "verificationDeniedMessage" TEXT;

-- ─── Verification panels ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "verification_panels" (
  "id"                TEXT    NOT NULL,
  "serverId"          TEXT    NOT NULL,
  "name"              TEXT    NOT NULL,
  "title"             TEXT    NOT NULL,
  "description"       TEXT,
  "color"             TEXT    NOT NULL DEFAULT '#00e5ff',
  "imageUrl"          TEXT,
  "thumbnailUrl"      TEXT,
  "channelId"         TEXT,
  "messageId"         TEXT,
  "type"              TEXT    NOT NULL DEFAULT 'BUTTON',
  "buttonLabel"       TEXT    NOT NULL DEFAULT 'Verify',
  "buttonEmoji"       TEXT,
  "buttonStyle"       TEXT    NOT NULL DEFAULT 'SUCCESS',
  "successMessage"    TEXT,
  "failureMessage"    TEXT,
  "mathDifficulty"    TEXT    NOT NULL DEFAULT 'EASY',
  "grantRoleIds"      TEXT[]  NOT NULL DEFAULT '{}',
  "removeRoleIds"     TEXT[]  NOT NULL DEFAULT '{}',
  "minAccountAgeDays" INTEGER,
  "logChannelId"      TEXT,
  "dmOnSuccess"       BOOLEAN NOT NULL DEFAULT false,
  "dmSuccessMessage"  TEXT,
  "successCount"      INTEGER NOT NULL DEFAULT 0,
  "failCount"         INTEGER NOT NULL DEFAULT 0,
  "maxAttempts"       INTEGER NOT NULL DEFAULT 5,
  "cooldownMinutes"   INTEGER NOT NULL DEFAULT 10,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_panels_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "verification_panels"
    ADD CONSTRAINT "verification_panels_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "verification_panels_serverId_idx"
  ON "verification_panels"("serverId");

-- ─── Verification attempts (audit log for brute-force detection) ──────────────
CREATE TABLE IF NOT EXISTS "verification_attempts" (
  "id"                  TEXT    NOT NULL,
  "verificationPanelId" TEXT    NOT NULL,
  "userId"              TEXT    NOT NULL,
  "success"             BOOLEAN NOT NULL DEFAULT false,
  "answer"              TEXT,
  "ip"                  TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_attempts_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "verification_attempts"
    ADD CONSTRAINT "verification_attempts_verificationPanelId_fkey"
    FOREIGN KEY ("verificationPanelId") REFERENCES "verification_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "verification_attempts_verificationPanelId_userId_createdAt_idx"
  ON "verification_attempts"("verificationPanelId", "userId", "createdAt");
