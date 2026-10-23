-- v52 — капан за спам ботове (honeypot): една нова таблица с настройки и брояч
-- по сървър. Адитивна миграция — нищо съществуващо не се пипа.

-- CreateTable
CREATE TABLE "honeypot_configs" (
    "serverId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channelId" TEXT,
    "action" TEXT NOT NULL DEFAULT 'softban',
    "logChannelId" TEXT,
    "dmUser" BOOLEAN NOT NULL DEFAULT true,
    "warningMessageId" TEXT,
    "caughtCount" INTEGER NOT NULL DEFAULT 0,
    "lastCaughtAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "honeypot_configs_pkey" PRIMARY KEY ("serverId")
);

-- AddForeignKey
ALTER TABLE "honeypot_configs" ADD CONSTRAINT "honeypot_configs_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
