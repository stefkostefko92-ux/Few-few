-- Втори фактор (TOTP), резервни кодове и таблица с АКТИВНИТЕ сесии.
--
-- Досега refresh token-ът беше един хеш върху `users`: вход от втори компютър
-- мълчаливо изхвърляше първия, нямаше как да се види откъде е влизано, и
-- „прекрати всички сесии" при уволнен служител не съществуваше. Всяка от
-- трите липси е въпрос, който ИТ отделът на клиента задава преди подпис.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "codiciRecupero" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "passwordCambiataAt" TIMESTAMP(3),
ADD COLUMN     "totpAttivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSegreto" TEXT;

-- CreateTable
CREATE TABLE "sessioni_attive" (
    "id" UUID NOT NULL,
    "utenteId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "ultimoUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scadenza" TIMESTAMP(3) NOT NULL,
    "revocataAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessioni_attive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessioni_attive_tokenHash_key" ON "sessioni_attive"("tokenHash");

-- CreateIndex
CREATE INDEX "sessioni_attive_utenteId_revocataAt_idx" ON "sessioni_attive"("utenteId", "revocataAt");

-- CreateIndex
CREATE INDEX "sessioni_attive_scadenza_idx" ON "sessioni_attive"("scadenza");

-- AddForeignKey
ALTER TABLE "sessioni_attive" ADD CONSTRAINT "sessioni_attive_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

