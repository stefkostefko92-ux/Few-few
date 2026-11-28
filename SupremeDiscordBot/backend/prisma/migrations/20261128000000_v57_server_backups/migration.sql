-- v57 — резервни копия на структурата на сървър (docs/BACKUP_SPEC.md).
-- Адитивна миграция — две нови таблици, нищо съществуващо не се пипа.
-- Без външни ключове към servers: копието трябва да оцелее изтриването на сървъра.

-- CreateTable
CREATE TABLE "server_backups" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "guildName" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdBy" TEXT,
    "kind" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "roleCount" INTEGER NOT NULL,
    "categoryCount" INTEGER NOT NULL,
    "channelCount" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_restores" (
    "id" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "sourceServerId" TEXT NOT NULL,
    "targetServerId" TEXT NOT NULL,
    "requestedBy" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activeServerId" TEXT,
    "idMap" JSONB NOT NULL DEFAULT '{}',
    "counts" JSONB NOT NULL DEFAULT '{}',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_restores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "server_backups_serverId_kind_createdAt_idx" ON "server_backups"("serverId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "server_backups_ownerId_idx" ON "server_backups"("ownerId");

-- CreateIndex
CREATE INDEX "server_backups_createdBy_idx" ON "server_backups"("createdBy");

-- CreateIndex
CREATE INDEX "server_backups_expiresAt_idx" ON "server_backups"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "backup_restores_activeServerId_key" ON "backup_restores"("activeServerId");

-- CreateIndex
CREATE INDEX "backup_restores_targetServerId_createdAt_idx" ON "backup_restores"("targetServerId", "createdAt");

-- CreateIndex
CREATE INDEX "backup_restores_status_heartbeatAt_idx" ON "backup_restores"("status", "heartbeatAt");

-- CreateIndex
CREATE INDEX "backup_restores_requestedBy_idx" ON "backup_restores"("requestedBy");
