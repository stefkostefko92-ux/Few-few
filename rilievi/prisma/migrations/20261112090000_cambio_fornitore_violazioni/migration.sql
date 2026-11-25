-- Смяната на доставчика (Data Act, чл. 23–30), регистърът на нарушенията (чл. 33(5) GDPR) и обявите на
-- новите версии на условията (чл. 18.1). Само добавя.

-- CreateEnum
CREATE TYPE "CambioEsito" AS ENUM ('ALTRO_FORNITORE', 'INFRASTRUTTURA_PROPRIA', 'CANCELLAZIONE');

-- CreateEnum
CREATE TYPE "RischioViolazione" AS ENUM ('IMPROBABILE', 'RISCHIO', 'ELEVATO');

-- CreateEnum
CREATE TYPE "RuoloViolazione" AS ENUM ('RESPONSABILE', 'TITOLARE');

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "cambioEsito" "CambioEsito",
ADD COLUMN     "cambioFineAt" TIMESTAMP(3),
ADD COLUMN     "cambioProrogato" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cambioRichiestoAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Violazione" (
    "id" TEXT NOT NULL,
    "rilevataAt" TIMESTAMP(3) NOT NULL,
    "eventoAt" TIMESTAMP(3),
    "titolo" VARCHAR(160) NOT NULL,
    "rilevazione" VARCHAR(2000) NOT NULL,
    "natura" VARCHAR(4000) NOT NULL,
    "ruolo" "RuoloViolazione" NOT NULL,
    "categorieDati" VARCHAR(2000) NOT NULL,
    "interessati" VARCHAR(2000) NOT NULL,
    "aziende" VARCHAR(2000) NOT NULL,
    "conseguenze" VARCHAR(4000) NOT NULL,
    "misure" VARCHAR(4000) NOT NULL,
    "rischio" "RischioViolazione" NOT NULL,
    "titolariAvvisatiAt" TIMESTAMP(3),
    "autoritaNotificataAt" TIMESTAMP(3),
    "autoritaProtocollo" VARCHAR(80),
    "interessatiAvvisatiAt" TIMESTAMP(3),
    "motivazione" VARCHAR(4000),
    "lezioni" VARCHAR(4000),
    "chiusaAt" TIMESTAMP(3),
    "autoreId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Violazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnuncioTesto" (
    "tipo" "TipoTesto" NOT NULL,
    "versione" VARCHAR(20) NOT NULL,
    "annunciatoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoreId" TEXT,
    "comunicazioneId" TEXT,
    "emailInviate" INTEGER,

    CONSTRAINT "AnnuncioTesto_pkey" PRIMARY KEY ("tipo","versione")
);

-- CreateIndex
CREATE INDEX "Violazione_rilevataAt_idx" ON "Violazione"("rilevataAt");

-- CreateIndex
CREATE INDEX "Violazione_autoreId_idx" ON "Violazione"("autoreId");

-- AddForeignKey
ALTER TABLE "Violazione" ADD CONSTRAINT "Violazione_autoreId_fkey" FOREIGN KEY ("autoreId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Трите полета на искането са заедно или ги няма; краят е след искането.
ALTER TABLE "Azienda" ADD CONSTRAINT "Azienda_cambio_check" CHECK (
  ("cambioRichiestoAt" IS NULL) = ("cambioFineAt" IS NULL)
  AND ("cambioRichiestoAt" IS NULL) = ("cambioEsito" IS NULL)
  AND ("cambioFineAt" IS NULL OR "cambioFineAt" > "cambioRichiestoAt")
  AND ("cambioRichiestoAt" IS NOT NULL OR NOT "cambioProrogato")
);

-- Празен текст в регистъра не е запис.
ALTER TABLE "Violazione" ADD CONSTRAINT "Violazione_testi_check" CHECK (
  length(btrim("titolo")) > 0 AND length(btrim("natura")) > 0
);
