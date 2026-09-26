-- Фискалната самоличност на ИЗДАВАЩАТА фирма + провинция на получателя.
--
-- Отделна таблица, а не поле в `tenants`: при еднофирмена инсталация
-- `tenantId` е NULL и запис в `tenants` изобщо няма, а данните на издателя
-- трябват на всеки печатен документ. Чл. 1, ал. 3 D.P.R. 472/1996 иска
-- generalità del cedente върху DDT; същите данни са и основата на бъдещия
-- XML за SDI.

-- AlterTable
ALTER TABLE "amministratori" ADD COLUMN     "provincia" TEXT;

-- CreateTable
CREATE TABLE "dati_azienda" (
    "id" UUID NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "partitaIva" TEXT,
    "codiceFiscale" TEXT,
    "indirizzo" TEXT,
    "cap" TEXT,
    "citta" TEXT,
    "provincia" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "pec" TEXT,
    "codiceSdi" TEXT,
    "iban" TEXT,
    "rea" TEXT,
    "capitaleSociale" TEXT,
    "notePiePagina" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dati_azienda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dati_azienda_tenantId_key" ON "dati_azienda"("tenantId");

