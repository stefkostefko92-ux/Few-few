-- Интеграция с helpdesk (FR-09, §14.4): конекторът на клиента (тайните — шифровани), outbox на
-- доставките с подредба по тикет, връзката тикет ↔ външен запис, защита от повторение на входящите
-- известия и източникът на събитието по тикета (без ехо обратно към helpdesk-а). Само адитивни промени.

-- CreateEnum
CREATE TYPE "TicketEventSource" AS ENUM ('APP', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "HelpdeskKind" AS ENUM ('WEBHOOK', 'ZENDESK', 'JSM');

-- CreateEnum
CREATE TYPE "HelpdeskDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'DELIVERED', 'SKIPPED', 'DEAD');

-- AlterTable
ALTER TABLE "TicketEvent" ADD COLUMN     "source" "TicketEventSource" NOT NULL DEFAULT 'APP';

-- CreateTable
CREATE TABLE "HelpdeskIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "HelpdeskKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "inboundId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpdeskIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpdeskDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" "HelpdeskDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpdeskDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpdeskLink" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpdeskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpdeskInboundReceipt" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpdeskInboundReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskIntegration_tenantId_key" ON "HelpdeskIntegration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskIntegration_inboundId_key" ON "HelpdeskIntegration"("inboundId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskDelivery_eventId_key" ON "HelpdeskDelivery"("eventId");

-- CreateIndex
CREATE INDEX "HelpdeskDelivery_status_notBefore_idx" ON "HelpdeskDelivery"("status", "notBefore");

-- CreateIndex
CREATE INDEX "HelpdeskDelivery_tenantId_createdAt_idx" ON "HelpdeskDelivery"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "HelpdeskDelivery_integrationId_idx" ON "HelpdeskDelivery"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskDelivery_ticketId_seq_key" ON "HelpdeskDelivery"("ticketId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskLink_ticketId_key" ON "HelpdeskLink"("ticketId");

-- CreateIndex
CREATE INDEX "HelpdeskLink_integrationId_externalKey_idx" ON "HelpdeskLink"("integrationId", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskLink_integrationId_externalId_key" ON "HelpdeskLink"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "HelpdeskInboundReceipt_receivedAt_idx" ON "HelpdeskInboundReceipt"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskInboundReceipt_integrationId_nonce_key" ON "HelpdeskInboundReceipt"("integrationId", "nonce");

-- AddForeignKey
ALTER TABLE "HelpdeskIntegration" ADD CONSTRAINT "HelpdeskIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskDelivery" ADD CONSTRAINT "HelpdeskDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskDelivery" ADD CONSTRAINT "HelpdeskDelivery_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "HelpdeskIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskDelivery" ADD CONSTRAINT "HelpdeskDelivery_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskDelivery" ADD CONSTRAINT "HelpdeskDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskLink" ADD CONSTRAINT "HelpdeskLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskLink" ADD CONSTRAINT "HelpdeskLink_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "HelpdeskIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskInboundReceipt" ADD CONSTRAINT "HelpdeskInboundReceipt_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "HelpdeskIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

