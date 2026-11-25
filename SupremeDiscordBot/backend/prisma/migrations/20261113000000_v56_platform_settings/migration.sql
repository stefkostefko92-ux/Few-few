-- v56 — настройки на платформата: една стойност по ключ. Първият ключ е
-- `support.inviteUrl` (поканата към сървъра за поддръжка, към която води `/support`);
-- главният акаунт я сменя от конзолата без нов билд.
-- Адитивна миграция — нова таблица, нищо съществуващо не се пипа.

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
