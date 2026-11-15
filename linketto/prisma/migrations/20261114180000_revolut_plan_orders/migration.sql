-- Revolut вместо Stripe (docs/revolut-migration-spec.md §7): предплатени планове
-- (PlanOrder), изтичане и напомняне на плана, външен линк за плащане при
-- създателя. Само добавяне — Stripe колоните остават (почистване след решение).

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "externalUrl" TEXT;

-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "planOrderId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "planReminded" INTEGER;

-- CreateTable
CREATE TABLE "PlanOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "interval" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "vatRateBp" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatCountry" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "revolutOrderId" TEXT,
    "buyerCountry" TEXT,
    "cardCountry" TEXT,
    "completedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "prevPlan" "Plan",
    "prevExpiresAt" TIMESTAMP(3),
    "confirmationSentAt" TIMESTAMP(3),
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "refundAttempts" INTEGER NOT NULL DEFAULT 0,
    "refundOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanOrder_revolutOrderId_key" ON "PlanOrder"("revolutOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanOrder_refundOrderId_key" ON "PlanOrder"("refundOrderId");

-- CreateIndex
CREATE INDEX "PlanOrder_userId_createdAt_idx" ON "PlanOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanOrder_state_createdAt_idx" ON "PlanOrder"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_planOrderId_key" ON "Referral"("planOrderId");

-- AddForeignKey
ALTER TABLE "PlanOrder" ADD CONSTRAINT "PlanOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

