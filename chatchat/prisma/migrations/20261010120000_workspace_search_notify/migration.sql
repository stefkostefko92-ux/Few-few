-- Работното пространство (FR-16, FR-18, NFR-08/12/13): търсене в историята, лични маркери на
-- съобщения, прикачени файлове в разговори, предпочитания и имейл outbox за известията, контролни
-- точки на одитната верига. Само адитивни промени.

-- Търсене (FR-16): unaccent е доверено разширение (PG13+) — стига CREATE право върху базата.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- „chatchat_search“: simple (без стемер — текстът е смесен it/en/bg и пълен с кодове E37, K1…)
-- + unaccent (è→e, ё→е): търсенето не зависи от ударения и регистър, еднакво за трите езика.
CREATE TEXT SEARCH CONFIGURATION chatchat_search (COPY = simple);
ALTER TEXT SEARCH CONFIGURATION chatchat_search
  ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, word, hword, hword_part, numword,
                    numhword, hword_numpart
  WITH unaccent, simple;

-- CreateEnum
CREATE TYPE "MessageMarkKind" AS ENUM ('TODO', 'STARRED');

-- CreateEnum
CREATE TYPE "EmailDigest" AS ENUM ('OFF', 'DAILY');

-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('MENTION', 'MESSAGE', 'CASE_ASSIGNED', 'CASE_URGENT', 'DIGEST');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "conversationId" TEXT;

-- AlterTable
-- Генерирана колона (to_tsvector(regconfig, text) е IMMUTABLE): пресмята се от Postgres при
-- запис/редакция — никой път на приложението не може да я забрави. Добавянето пренаписва
-- таблицата веднъж (кратко заключване при деплоя).
ALTER TABLE "CaseMessage" ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('chatchat_search'::regconfig, "body")) STORED;

-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('chatchat_search'::regconfig, "body")) STORED;

-- CreateTable
CREATE TABLE "MessageMark" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MessageMarkKind" NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageMark_pkey" PRIMARY KEY ("messageId","userId","kind")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digest" "EmailDigest" NOT NULL DEFAULT 'OFF',
    "quietStart" INTEGER,
    "quietEnd" INTEGER,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "notificationId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditCheckpoint" (
    "id" SERIAL NOT NULL,
    "throughId" INTEGER NOT NULL,
    "throughHash" TEXT NOT NULL,
    "fromHash" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL,
    "archiveSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageMark_userId_kind_createdAt_idx" ON "MessageMark"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "MessageMark_tenantId_idx" ON "MessageMark"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationSettings_tenantId_idx" ON "NotificationSettings"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationSettings_digest_idx" ON "NotificationSettings"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_dedupeKey_key" ON "EmailOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_notBefore_idx" ON "EmailOutbox"("status", "notBefore");

-- CreateIndex
CREATE INDEX "EmailOutbox_userId_idx" ON "EmailOutbox"("userId");

-- CreateIndex
CREATE INDEX "EmailOutbox_tenantId_createdAt_idx" ON "EmailOutbox"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_notificationId_idx" ON "EmailOutbox"("notificationId");

-- CreateIndex
CREATE INDEX "AuditCheckpoint_throughId_idx" ON "AuditCheckpoint"("throughId");

-- CreateIndex
CREATE INDEX "Attachment_conversationId_idx" ON "Attachment"("conversationId");

-- CreateIndex
CREATE INDEX "CaseMessage_tsv_idx" ON "CaseMessage" USING GIN ("tsv");

-- CreateIndex
CREATE INDEX "ConversationMessage_tsv_idx" ON "ConversationMessage" USING GIN ("tsv");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMark" ADD CONSTRAINT "MessageMark_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMark" ADD CONSTRAINT "MessageMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMark" ADD CONSTRAINT "MessageMark_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

