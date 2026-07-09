-- v3.0 Tiers: Premium / White-label / Agency(5,10), annual billing, Discord
-- native monetization (Premium Apps entitlements), and multi-server Agency plans.

-- ─── servers: tier + billing + Discord entitlement + agency membership ───────
ALTER TABLE "servers" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "servers" ADD COLUMN "billingInterval" TEXT;
ALTER TABLE "servers" ADD COLUMN "planSource" TEXT;
ALTER TABLE "servers" ADD COLUMN "discordEntitlementId" TEXT;
ALTER TABLE "servers" ADD COLUMN "discordSkuId" TEXT;
ALTER TABLE "servers" ADD COLUMN "agencyId" TEXT;

-- Grandfather existing subscribers: the legacy €9.99 tier INCLUDED white-label,
-- so map every currently-premium server to the white-label tier to preserve
-- exactly what they already had. Everyone else stays free.
UPDATE "servers" SET "plan" = 'whitelabel', "planSource" = 'stripe'
  WHERE "isPremium" = true;

CREATE UNIQUE INDEX "servers_discordEntitlementId_key" ON "servers"("discordEntitlementId");
CREATE INDEX "servers_agencyId_idx" ON "servers"("agencyId");

-- ─── agencies: one subscription covering up to N servers ─────────────────────
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "seatLimit" INTEGER NOT NULL,
    "billingInterval" TEXT,
    "planSource" TEXT NOT NULL DEFAULT 'stripe',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeStatus" TEXT,
    "pastDueSince" TIMESTAMP(3),
    "discordEntitlementId" TEXT,
    "discordSkuId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agencies_stripeCustomerId_key" ON "agencies"("stripeCustomerId");
CREATE UNIQUE INDEX "agencies_stripeSubscriptionId_key" ON "agencies"("stripeSubscriptionId");
CREATE UNIQUE INDEX "agencies_discordEntitlementId_key" ON "agencies"("discordEntitlementId");
CREATE INDEX "agencies_ownerUserId_idx" ON "agencies"("ownerUserId");

ALTER TABLE "servers" ADD CONSTRAINT "servers_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
