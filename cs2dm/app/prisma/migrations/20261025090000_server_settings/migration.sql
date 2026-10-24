-- cs2dm: живите настройки на сървъра (CONTRACT.md §11). Само добавяне — нищо съществуващо не се променя.
-- Ключовете са затворен списък (adverts, ammo, bots, xp, join); стойността е JSON, проверен и от
-- панела (zod), и от плъгина (ServerSettings.Parse). Без ред важи конфигът на плъгина.

-- CreateTable
CREATE TABLE "server_settings" (
    "key" VARCHAR(32) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(17),

    CONSTRAINT "server_settings_pkey" PRIMARY KEY ("key")
);
