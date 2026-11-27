-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TicketClass" AS ENUM ('question', 'technical', 'payment', 'complaint', 'dsar', 'legal', 'spam');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('new', 'drafting', 'drafted', 'draft_failed', 'needs_human', 'sent', 'closed');

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecretEnc" TEXT NOT NULL,
    "totpLastStep" INTEGER,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "cls" "TicketClass" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'new',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "fromEnc" TEXT NOT NULL,
    "subjectEnc" TEXT NOT NULL,
    "textEnc" TEXT NOT NULL,
    "attachmentsEnc" TEXT NOT NULL,
    "draftEnc" TEXT,
    "draftAt" TIMESTAMP(3),
    "sentHash" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sample" (
    "id" TEXT NOT NULL,
    "textEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_messageKey_key" ON "Ticket"("messageKey");

-- CreateIndex
CREATE INDEX "Ticket_status_receivedAt_idx" ON "Ticket"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "Ticket_receivedAt_idx" ON "Ticket"("receivedAt");

