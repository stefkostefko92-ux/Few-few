-- Съобщенията на MASTER до фирмите (лента в портала) и кой ги е затворил. Само добавя.

-- CreateEnum
CREATE TYPE "LivelloComunicazione" AS ENUM ('INFO', 'AVVISO', 'URGENTE');

-- CreateTable
CREATE TABLE "Comunicazione" (
    "id" TEXT NOT NULL,
    "titolo" VARCHAR(120) NOT NULL,
    "testo" VARCHAR(2000) NOT NULL,
    "livello" "LivelloComunicazione" NOT NULL DEFAULT 'INFO',
    "aziendaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inizioAt" TIMESTAMP(3) NOT NULL,
    "fineAt" TIMESTAMP(3),
    "fermataAt" TIMESTAMP(3),
    "autoreId" TEXT,
    "emailInviate" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comunicazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComunicazioneChiusa" (
    "comunicazioneId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComunicazioneChiusa_pkey" PRIMARY KEY ("comunicazioneId","userId")
);

-- CreateIndex
CREATE INDEX "Comunicazione_inizioAt_idx" ON "Comunicazione"("inizioAt");

-- CreateIndex
CREATE INDEX "Comunicazione_autoreId_idx" ON "Comunicazione"("autoreId");

-- CreateIndex
CREATE INDEX "ComunicazioneChiusa_userId_idx" ON "ComunicazioneChiusa"("userId");

-- AddForeignKey
ALTER TABLE "Comunicazione" ADD CONSTRAINT "Comunicazione_autoreId_fkey" FOREIGN KEY ("autoreId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComunicazioneChiusa" ADD CONSTRAINT "ComunicazioneChiusa_comunicazioneId_fkey" FOREIGN KEY ("comunicazioneId") REFERENCES "Comunicazione"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComunicazioneChiusa" ADD CONSTRAINT "ComunicazioneChiusa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Краят е след началото; заглавието и текстът не са празни.
ALTER TABLE "Comunicazione" ADD CONSTRAINT "Comunicazione_finestra_check" CHECK ("fineAt" IS NULL OR "fineAt" > "inizioAt");
ALTER TABLE "Comunicazione" ADD CONSTRAINT "Comunicazione_testo_check" CHECK (length(btrim("titolo")) > 0 AND length(btrim("testo")) > 0);
