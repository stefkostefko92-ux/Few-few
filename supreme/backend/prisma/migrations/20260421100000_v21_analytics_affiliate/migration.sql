-- Migration: v2.1 — Affiliate program + Public API + Analytics 2.0
-- Fully idempotent.

-- ─── AFFILIATE CODES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "affiliate_codes" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "code"            TEXT NOT NULL,
  "clicks"          INTEGER NOT NULL DEFAULT 0,
  "signups"         INTEGER NOT NULL DEFAULT 0,
  "conversions"     INTEGER NOT NULL DEFAULT 0,
  "totalEarnings"   INTEGER NOT NULL DEFAULT 0,
  "pendingEarnings" INTEGER NOT NULL DEFAULT 0,
  "paidEarnings"    INTEGER NOT NULL DEFAULT 0,
  "paypalEmail"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_codes_userId_key" ON "affiliate_codes"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_codes_code_key" ON "affiliate_codes"("code");

-- ─── AFFILIATE REFERRALS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "affiliate_referrals" (
  "id"              TEXT NOT NULL,
  "affiliateId"     TEXT NOT NULL,
  "referredServerId" TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'pending',
  "firstPaymentAt"  TIMESTAMP(3),
  "lastPaymentAt"   TIMESTAMP(3),
  "totalEarnings"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_referrals_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_affiliateId_fkey"
    FOREIGN KEY ("affiliateId") REFERENCES "affiliate_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_referrals_affiliateId_referredServerId_key"
  ON "affiliate_referrals"("affiliateId", "referredServerId");
CREATE INDEX IF NOT EXISTS "affiliate_referrals_referredServerId_idx" ON "affiliate_referrals"("referredServerId");

-- ─── API KEYS ─ already exists from previous migration; add missing columns ─
DO $$ BEGIN
  ALTER TABLE "api_keys" ADD COLUMN "createdBy" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ─── DAILY METRICS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "daily_metrics" (
  "id"                  TEXT NOT NULL,
  "serverId"            TEXT NOT NULL,
  "date"                DATE NOT NULL,
  "ticketsOpened"       INTEGER NOT NULL DEFAULT 0,
  "ticketsClosed"       INTEGER NOT NULL DEFAULT 0,
  "ticketsEscalated"    INTEGER NOT NULL DEFAULT 0,
  "formsSubmitted"      INTEGER NOT NULL DEFAULT 0,
  "applicationsApproved" INTEGER NOT NULL DEFAULT 0,
  "applicationsDenied"   INTEGER NOT NULL DEFAULT 0,
  "verificationsSuccess" INTEGER NOT NULL DEFAULT 0,
  "verificationsFailure" INTEGER NOT NULL DEFAULT 0,
  "avgResponseTimeSec"   INTEGER,
  "avgResolutionTimeSec" INTEGER,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_metrics_serverId_date_key" ON "daily_metrics"("serverId", "date");
CREATE INDEX IF NOT EXISTS "daily_metrics_serverId_date_idx" ON "daily_metrics"("serverId", "date");
