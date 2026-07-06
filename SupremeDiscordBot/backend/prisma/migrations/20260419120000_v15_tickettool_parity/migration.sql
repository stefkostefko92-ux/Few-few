-- Migration: v1.5 — TicketTool parity (ticket counter, categories, two-step close, logging, feedback, etc.)
-- Fully idempotent (safe to re-run). Backward-compatible — all new columns are nullable or defaulted.

-- ─── Panels: 23 new columns ───────────────────────────────────────────────────
ALTER TABLE "panels"
  ADD COLUMN IF NOT EXISTS "categoryOpenId"       TEXT,
  ADD COLUMN IF NOT EXISTS "categoryClosedId"     TEXT,
  ADD COLUMN IF NOT EXISTS "logChannelId"         TEXT,
  ADD COLUMN IF NOT EXISTS "transcriptChannelId"  TEXT,
  ADD COLUMN IF NOT EXISTS "channelNamePrefix"    TEXT    NOT NULL DEFAULT 'ticket',
  ADD COLUMN IF NOT EXISTS "ticketCounter"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "counterPadding"       INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "welcomeMessage"       TEXT,
  ADD COLUMN IF NOT EXISTS "welcomeEmbedColor"    TEXT    NOT NULL DEFAULT '#00e5ff',
  ADD COLUMN IF NOT EXISTS "closeAskEnabled"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "closeAskMessage"      TEXT,
  ADD COLUMN IF NOT EXISTS "dmOnOpen"             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dmOnOpenMessage"      TEXT,
  ADD COLUMN IF NOT EXISTS "dmOnClose"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dmOnCloseMessage"     TEXT,
  ADD COLUMN IF NOT EXISTS "observerRoleIds"      TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "maxOpenPerUserPanel"  INTEGER,
  ADD COLUMN IF NOT EXISTS "buttonStyle"          TEXT    NOT NULL DEFAULT 'BUTTON',
  ADD COLUMN IF NOT EXISTS "inactivityCloseHours" INTEGER,
  ADD COLUMN IF NOT EXISTS "autoCloseOnLeave"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feedbackEnabled"      BOOLEAN NOT NULL DEFAULT false;

-- ─── Tickets: counter, feedback, activity tracking ───────────────────────────
ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "number"           INTEGER,
  ADD COLUMN IF NOT EXISTS "reopenedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reopenCount"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "renamedFrom"      TEXT,
  ADD COLUMN IF NOT EXISTS "feedbackRating"   INTEGER,
  ADD COLUMN IF NOT EXISTS "feedbackComment"  TEXT,
  ADD COLUMN IF NOT EXISTS "feedbackAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastActivityAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "inactivityNotifiedAt" TIMESTAMP(3);

-- Backfill: set lastActivityAt = createdAt for existing rows
UPDATE "tickets" SET "lastActivityAt" = "createdAt" WHERE "lastActivityAt" IS NULL;

-- Index for inactivity scanner
CREATE INDEX IF NOT EXISTS "tickets_status_lastActivityAt_idx"
  ON "tickets" ("status", "lastActivityAt");

-- Index for "tickets by number" lookups (e.g. /rename, /ticket 0042)
CREATE INDEX IF NOT EXISTS "tickets_panelId_number_idx"
  ON "tickets" ("panelId", "number");
