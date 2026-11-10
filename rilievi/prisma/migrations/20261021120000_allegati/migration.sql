-- Октомври 2026 (21-ви): снимки и клипове към разделите на картата. Таблицата пази описанието и докъде е
-- обработката (компресията е във фоновия процес); файловете са на диска. Изборът дали снимките влизат в
-- печата и PDF-а — нова колона на картата (по подразбиране не). Само добавя — предишният код не я чете.

-- CreateEnum
CREATE TYPE "TipoAllegato" AS ENUM ('FOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "StatoAllegato" AS ENUM ('IN_CODA', 'IN_LAVORAZIONE', 'PRONTO', 'ERRORE');

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "fotoStampate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Allegato" (
    "id" TEXT NOT NULL,
    "schedaId" TEXT NOT NULL,
    "sezione" VARCHAR(20) NOT NULL,
    "tipo" "TipoAllegato" NOT NULL,
    "stato" "StatoAllegato" NOT NULL DEFAULT 'IN_CODA',
    "didascalia" VARCHAR(200),
    "nomeOriginale" VARCHAR(200) NOT NULL,
    "byteOriginali" INTEGER NOT NULL,
    "byte" INTEGER,
    "larghezza" INTEGER,
    "altezza" INTEGER,
    "durataMs" INTEGER,
    "errore" VARCHAR(40),
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "caricatoDaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allegato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Allegato_schedaId_sezione_createdAt_idx" ON "Allegato"("schedaId", "sezione", "createdAt");

-- CreateIndex
CREATE INDEX "Allegato_stato_createdAt_idx" ON "Allegato"("stato", "createdAt");

-- CreateIndex
CREATE INDEX "Allegato_caricatoDaId_idx" ON "Allegato"("caricatoDaId");

-- AddForeignKey
ALTER TABLE "Allegato" ADD CONSTRAINT "Allegato_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allegato" ADD CONSTRAINT "Allegato_caricatoDaId_fkey" FOREIGN KEY ("caricatoDaId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

