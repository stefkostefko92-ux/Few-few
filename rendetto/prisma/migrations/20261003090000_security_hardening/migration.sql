-- Сигурност: броене на неуспешни опити по мрежа (IPv6 /64), одитна верига с ключ (v2) и начало след
-- изтриване по срок. Само добавяне — старите редове остават валидни.

-- AlterTable
ALTER TABLE "LoginEvent" ADD COLUMN "ipNet" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "v" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "AuditBase" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastId" INTEGER NOT NULL,
    "lastHash" TEXT NOT NULL,
    "prunedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditBase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginEvent_ipNet_createdAt_idx" ON "LoginEvent"("ipNet", "createdAt");
