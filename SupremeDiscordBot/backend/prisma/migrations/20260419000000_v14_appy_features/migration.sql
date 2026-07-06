-- Migration: v1.4 — botRemovedAt, appy.bot-style form features, validation regex
-- Safe to apply on top of v1.0 schema. All additions are nullable or have defaults.

-- Server: soft-delete marker when bot leaves guild
ALTER TABLE "servers"
  ADD COLUMN IF NOT EXISTS "botRemovedAt" TIMESTAMP(3);

-- Form: appy.bot-inspired features
ALTER TABLE "forms"
  ADD COLUMN IF NOT EXISTS "acceptRoleIds"       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "denyRoleIds"         TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "removeRoleIds"       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "managerRoleIds"      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "pingRoleIds"         TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "acceptMessage"       TEXT,
  ADD COLUMN IF NOT EXISTS "denyMessage"         TEXT,
  ADD COLUMN IF NOT EXISTS "cooldownSeconds"     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxSubmissions"      INTEGER,
  ADD COLUMN IF NOT EXISTS "closedAt"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "requireVerification" BOOLEAN NOT NULL DEFAULT false;

-- FormQuestion: regex validation
ALTER TABLE "form_questions"
  ADD COLUMN IF NOT EXISTS "validationRegex"   TEXT,
  ADD COLUMN IF NOT EXISTS "validationMessage" TEXT;

-- FormCooldown: per-user per-form cooldown tracking
CREATE TABLE IF NOT EXISTS "form_cooldowns" (
  "id"              TEXT         NOT NULL,
  "formId"          TEXT         NOT NULL,
  "userId"          TEXT         NOT NULL,
  "lastSubmittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submissionCount" INTEGER      NOT NULL DEFAULT 1,
  CONSTRAINT "form_cooldowns_pkey"   PRIMARY KEY ("id")
);

-- Unique + index (safe re-run)
CREATE UNIQUE INDEX IF NOT EXISTS "form_cooldowns_formId_userId_key" ON "form_cooldowns" ("formId", "userId");
CREATE INDEX        IF NOT EXISTS "form_cooldowns_formId_userId_idx" ON "form_cooldowns" ("formId", "userId");

-- Foreign key (wrapped in DO block because IF NOT EXISTS is not supported for FK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'form_cooldowns_formId_fkey'
  ) THEN
    ALTER TABLE "form_cooldowns"
      ADD CONSTRAINT "form_cooldowns_formId_fkey"
      FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
