-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('RECEIVED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "failedCodes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpLastStep" INTEGER;

-- CreateTable
CREATE TABLE "InboxEntry" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "recipientOrgId" TEXT NOT NULL,
    "senderOrgId" TEXT NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'RECEIVED',
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "rejectReason" TEXT,

    CONSTRAINT "InboxEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "kind" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxEntry_recipientOrgId_deliveredAt_idx" ON "InboxEntry"("recipientOrgId", "deliveredAt");

-- CreateIndex
CREATE INDEX "InboxEntry_senderOrgId_idx" ON "InboxEntry"("senderOrgId");

-- CreateIndex
CREATE INDEX "InboxEntry_decidedById_idx" ON "InboxEntry"("decidedById");

-- CreateIndex
CREATE UNIQUE INDEX "InboxEntry_documentId_recipientOrgId_key" ON "InboxEntry"("documentId", "recipientOrgId");

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");

-- AddForeignKey
ALTER TABLE "InboxEntry" ADD CONSTRAINT "InboxEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxEntry" ADD CONSTRAINT "InboxEntry_recipientOrgId_fkey" FOREIGN KEY ("recipientOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxEntry" ADD CONSTRAINT "InboxEntry_senderOrgId_fkey" FOREIGN KEY ("senderOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxEntry" ADD CONSTRAINT "InboxEntry_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
