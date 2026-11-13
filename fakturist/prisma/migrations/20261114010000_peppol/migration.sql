-- Peppol през точка за достъп (SPEC 57–59; решение на собственика 13.11.2026). Само добавя.
-- CreateEnum
CREATE TYPE "PeppolParticipantStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PeppolTransmissionStatus" AS ENUM ('QUEUED', 'ACCEPTED', 'SENT', 'RETRYING', 'FAILED');

-- AlterTable
ALTER TABLE "IncomingInvoice" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'UPLOAD';

-- CreateTable
CREATE TABLE "PeppolParticipant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "status" "PeppolParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "hookSecretEnc" TEXT,
    "lastError" TEXT,
    "enrolledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeppolParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeppolTransmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "senderPartyId" TEXT NOT NULL,
    "receiverPartyId" TEXT NOT NULL,
    "providerDocumentId" TEXT NOT NULL,
    "status" "PeppolTransmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeppolTransmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeppolEvent" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "documentId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "PeppolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PeppolParticipant_organizationId_key" ON "PeppolParticipant"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PeppolParticipant_partyId_key" ON "PeppolParticipant"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "PeppolTransmission_documentId_key" ON "PeppolTransmission"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "PeppolTransmission_providerDocumentId_key" ON "PeppolTransmission"("providerDocumentId");

-- CreateIndex
CREATE INDEX "PeppolTransmission_status_nextAttemptAt_idx" ON "PeppolTransmission"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PeppolTransmission_organizationId_createdAt_idx" ON "PeppolTransmission"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PeppolEvent_deliveryId_key" ON "PeppolEvent"("deliveryId");

-- CreateIndex
CREATE INDEX "PeppolEvent_receivedAt_idx" ON "PeppolEvent"("receivedAt");

-- AddForeignKey
ALTER TABLE "PeppolParticipant" ADD CONSTRAINT "PeppolParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeppolTransmission" ADD CONSTRAINT "PeppolTransmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeppolTransmission" ADD CONSTRAINT "PeppolTransmission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

