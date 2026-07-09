-- Migration: v2.0 — Premium trial system
-- Adds 3 columns to servers table for 14-day trial tracking.
-- Fully idempotent.

DO $$ BEGIN
  ALTER TABLE "servers" ADD COLUMN "trialUsed" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "servers" ADD COLUMN "trialStartedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "servers" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "servers_trialEndsAt_idx" ON "servers"("trialEndsAt") WHERE "trialEndsAt" IS NOT NULL;
