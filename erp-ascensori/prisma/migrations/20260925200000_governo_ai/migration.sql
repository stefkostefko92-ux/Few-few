-- Управление на ИИ асистента: глобално, по функция, по роля, по акаунт.
--
-- Доставчикът и ключът остават в средата (тайните не влизат в базата). Тук е
-- решението КОЙ го ползва — сменя се от MASTER без рестарт.
-- Адитивно: нова таблица и една колона с подразбиране „разрешено".

ALTER TABLE "users" ADD COLUMN "aiConsentita" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "configurazione_ai" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "estraiAttiva" BOOLEAN NOT NULL DEFAULT true,
    "testoAttiva" BOOLEAN NOT NULL DEFAULT true,
    "ruoliAmmessi" "UserRole"[] DEFAULT ARRAY['MASTER', 'ADMIN', 'DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE']::"UserRole"[],
    "aggiornataDa" UUID,
    "aggiornataAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurazione_ai_pkey" PRIMARY KEY ("id")
);
