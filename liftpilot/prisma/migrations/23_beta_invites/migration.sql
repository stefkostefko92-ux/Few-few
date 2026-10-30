-- Round 48: the beta by invitation. The platform administrator invites a tester's address (BetaInvite); while
-- REGISTRATION_MODE=invite only the invitation's link opens the registration, for that address, and the waiting
-- registration remembers it (PendingRegistration.betaInviteId) until the confirmation e-mail makes the company.
-- Additive: no existing row changes. Back: DROP the column, then the table.

-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "betaInviteId" TEXT;

-- CreateTable
CREATE TABLE "BetaInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BetaInvite_tokenHash_key" ON "BetaInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "BetaInvite_email_idx" ON "BetaInvite"("email");

-- CreateIndex
CREATE INDEX "BetaInvite_createdById_idx" ON "BetaInvite"("createdById");

-- CreateIndex
CREATE INDEX "BetaInvite_companyId_idx" ON "BetaInvite"("companyId");

-- CreateIndex
CREATE INDEX "BetaInvite_expiresAt_idx" ON "BetaInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "PendingRegistration_betaInviteId_idx" ON "PendingRegistration"("betaInviteId");

-- AddForeignKey
ALTER TABLE "PendingRegistration" ADD CONSTRAINT "PendingRegistration_betaInviteId_fkey" FOREIGN KEY ("betaInviteId") REFERENCES "BetaInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaInvite" ADD CONSTRAINT "BetaInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaInvite" ADD CONSTRAINT "BetaInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
