-- Round 17: the company's owner and three roles for the colleagues (Progettista ENGINEER, Commerciale SALES, Tecnico
-- TECHNICIAN); the old roles go: VIEWER (sees and downloads) becomes SALES, MANAGER and ADMIN become ENGINEER (the user
-- management is the owner's). The monthly subscription with the packs of slots (Stripe), the trial, the processed
-- Stripe events, the company's price list.

-- Roles: a new type, the rows mapped, the old type dropped (Postgres cannot drop values from an enum)
CREATE TYPE "Role_new" AS ENUM ('SALES', 'TECHNICIAN', 'ENGINEER', 'OWNER', 'SUPERADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'VIEWER' THEN 'SALES'
    WHEN 'MANAGER' THEN 'ENGINEER'
    WHEN 'ADMIN' THEN 'ENGINEER'
    ELSE "role"::text
  END
)::"Role_new";
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'TECHNICIAN';

-- Subscription
CREATE TYPE "SeatPack" AS ENUM ('NONE', 'FIVE', 'TEN', 'UNLIMITED');
ALTER TABLE "Company" ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "subscriptionStatus" TEXT,
  ADD COLUMN "seatPack" "SeatPack" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "periodEnd" TIMESTAMP(3),
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "billingExempt" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Company_stripeCustomerId_key" ON "Company"("stripeCustomerId");
CREATE UNIQUE INDEX "Company_stripeSubscriptionId_key" ON "Company"("stripeSubscriptionId");
-- the platform's own company is never billed; every other company starts its trial at its first sign-in with billing on
-- (src/lib/billing-access.ts), so trialEndsAt stays empty here
UPDATE "Company" SET "billingExempt" = true WHERE "id" IN (SELECT "companyId" FROM "User" WHERE "role" = 'SUPERADMIN');

CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- Price list
CREATE TABLE "PriceItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PriceItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PriceItem_cents_check" CHECK ("cents" >= 0)
);
CREATE UNIQUE INDEX "PriceItem_companyId_key_key" ON "PriceItem"("companyId", "key");
CREATE INDEX "PriceItem_companyId_idx" ON "PriceItem"("companyId");
ALTER TABLE "PriceItem" ADD CONSTRAINT "PriceItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
