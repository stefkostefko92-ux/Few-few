-- Предаване на собственост (SPEC 84–88): поканата помни предаващия собственик; предложения към кантора.
-- Само добавяне — без загуба на данни.
-- CreateEnum
CREATE TYPE "FirmHandoverStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- AlterTable
ALTER TABLE "TransferInvite" ADD COLUMN     "fromUserId" TEXT;

-- CreateTable
CREATE TABLE "FirmHandover" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "status" "FirmHandoverStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "FirmHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FirmHandover_organizationId_idx" ON "FirmHandover"("organizationId");

-- CreateIndex
CREATE INDEX "FirmHandover_firmId_status_idx" ON "FirmHandover"("firmId", "status");

-- CreateIndex
CREATE INDEX "FirmHandover_fromUserId_idx" ON "FirmHandover"("fromUserId");

-- CreateIndex
CREATE INDEX "FirmHandover_decidedById_idx" ON "FirmHandover"("decidedById");

-- CreateIndex
CREATE INDEX "TransferInvite_fromUserId_idx" ON "TransferInvite"("fromUserId");

-- AddForeignKey
ALTER TABLE "TransferInvite" ADD CONSTRAINT "TransferInvite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmHandover" ADD CONSTRAINT "FirmHandover_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmHandover" ADD CONSTRAINT "FirmHandover_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmHandover" ADD CONSTRAINT "FirmHandover_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmHandover" ADD CONSTRAINT "FirmHandover_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

