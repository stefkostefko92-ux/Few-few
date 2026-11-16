-- Покани за членове (SPEC 45) и заключване след грешни пароли (SPEC 46). Само добавя.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "lockouts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MemberInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberInvite_tokenHash_key" ON "MemberInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "MemberInvite_organizationId_createdAt_idx" ON "MemberInvite"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberInvite_createdById_idx" ON "MemberInvite"("createdById");

-- CreateIndex
CREATE INDEX "MemberInvite_acceptedById_idx" ON "MemberInvite"("acceptedById");

-- AddForeignKey
ALTER TABLE "MemberInvite" ADD CONSTRAINT "MemberInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberInvite" ADD CONSTRAINT "MemberInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberInvite" ADD CONSTRAINT "MemberInvite_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

