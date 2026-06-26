-- Migration: v2.2 — Form transcript channel
-- Idempotent.

DO $$ BEGIN
  ALTER TABLE "forms" ADD COLUMN "transcriptChannelId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
