-- Migration: v1.6 — appy.bot parity (welcomer, autorole, escalate, sticky messages)
-- Idempotent and safe to re-run.

-- ─── Servers: welcomer + autorole ─────────────────────────────────────────────
ALTER TABLE "servers"
  ADD COLUMN IF NOT EXISTS "welcomerEnabled"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "welcomerChannelId"     TEXT,
  ADD COLUMN IF NOT EXISTS "welcomerMessage"       TEXT,
  ADD COLUMN IF NOT EXISTS "welcomerEmbedColor"    TEXT    DEFAULT '#00e5ff',
  ADD COLUMN IF NOT EXISTS "welcomerDmEnabled"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "welcomerDmMessage"     TEXT,
  ADD COLUMN IF NOT EXISTS "autoroleIds"           TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "autoroleBotIds"        TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "stickyMessagesEnabled" BOOLEAN NOT NULL DEFAULT false;
