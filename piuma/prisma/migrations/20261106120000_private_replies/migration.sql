-- CreateEnum
CREATE TYPE "ReplyRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "PrivateReplyStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "igProfessionalId" TEXT;

-- CreateTable
CREATE TABLE "ReplyRule" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ReplyRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "announced" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateReply" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ruleId" TEXT,
    "mediaId" TEXT,
    "status" "PrivateReplyStatus" NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplyRule_accountId_status_idx" ON "ReplyRule"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateReply_commentId_key" ON "PrivateReply"("commentId");

-- CreateIndex
CREATE INDEX "PrivateReply_accountId_createdAt_idx" ON "PrivateReply"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "PrivateReply_createdAt_idx" ON "PrivateReply"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_igProfessionalId_key" ON "InstagramAccount"("igProfessionalId");

-- AddForeignKey
ALTER TABLE "ReplyRule" ADD CONSTRAINT "ReplyRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateReply" ADD CONSTRAINT "PrivateReply_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateReply" ADD CONSTRAINT "PrivateReply_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReplyRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

