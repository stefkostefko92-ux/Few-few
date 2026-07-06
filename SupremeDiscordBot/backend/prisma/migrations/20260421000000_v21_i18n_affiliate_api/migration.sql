-- Migration: v2.1 — Multi-language, Affiliate Program, Public API
-- Fully idempotent.

-- ─── USER columns (language + affiliate) ──────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "referralCode" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "referredByCode" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "stripeConnectedAccountId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "users_referralCode_key" ON "users"("referralCode") WHERE "referralCode" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_stripeConnectedAccountId_key" ON "users"("stripeConnectedAccountId") WHERE "stripeConnectedAccountId" IS NOT NULL;

-- ─── SERVER columns (language + affiliate tracking) ──────────────────────────
DO $$ BEGIN
  ALTER TABLE "servers" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "servers" ADD COLUMN "referredByCode" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ─── API KEYS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "serverId"     TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "keyHash"      TEXT NOT NULL,
  "keyPrefix"    TEXT NOT NULL,
  "scopes"       TEXT[] NOT NULL DEFAULT '{}',
  "lastUsedAt"   TIMESTAMP(3),
  "expiresAt"    TIMESTAMP(3),
  "revokedAt"    TIMESTAMP(3),
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX IF NOT EXISTS "api_keys_serverId_revokedAt_idx" ON "api_keys"("serverId", "revokedAt");
CREATE INDEX IF NOT EXISTS "api_keys_keyHash_idx" ON "api_keys"("keyHash");

DO $$ BEGIN
  ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── REFERRAL COMMISSIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "referral_commissions" (
  "id"               TEXT NOT NULL,
  "referrerId"       TEXT NOT NULL,
  "referredServerId" TEXT NOT NULL,
  "stripeInvoiceId"  TEXT NOT NULL,
  "amountCents"      INTEGER NOT NULL,
  "commissionCents"  INTEGER NOT NULL,
  "currency"         TEXT NOT NULL DEFAULT 'usd',
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "payoutId"         TEXT,
  "paidAt"           TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_commissions_stripeInvoiceId_key" ON "referral_commissions"("stripeInvoiceId");
CREATE INDEX IF NOT EXISTS "referral_commissions_referrerId_status_idx" ON "referral_commissions"("referrerId", "status");
CREATE INDEX IF NOT EXISTS "referral_commissions_createdAt_idx" ON "referral_commissions"("createdAt");

DO $$ BEGIN
  ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
