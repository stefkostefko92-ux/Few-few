-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('SOPRALLUOGO', 'CONTROLLO_QUALITA', 'ESAME_DOCUMENTALE', 'VERBALE');

-- CreateEnum
CREATE TYPE "StatoDocumento" AS ENUM ('BOZZA', 'EMESSO');

-- AlterTable
ALTER TABLE "Utente" ADD COLUMN     "qualifica" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "stato" "StatoDocumento" NOT NULL DEFAULT 'BOZZA',
    "numero" TEXT,
    "revisione" INTEGER NOT NULL DEFAULT 0,
    "revisioneDi" TEXT,
    "versione" INTEGER NOT NULL DEFAULT 1,
    "titolo" TEXT NOT NULL,
    "intestazione" JSONB NOT NULL,
    "dati" JSONB NOT NULL,
    "richiestaId" TEXT,
    "autoreId" TEXT,
    "autoreNome" TEXT NOT NULL DEFAULT '',
    "autoreQualifica" TEXT NOT NULL DEFAULT '',
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,
    "emessoIl" TIMESTAMP(3),
    "pdfSha256" TEXT,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FotoDocumento" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,
    "didascalia" TEXT NOT NULL DEFAULT '',
    "ubicazione" TEXT NOT NULL DEFAULT '',
    "riferimento" TEXT NOT NULL DEFAULT '',
    "larghezza" INTEGER NOT NULL,
    "altezza" INTEGER NOT NULL,
    "byte" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FotoDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoEliminato" (
    "id" TEXT NOT NULL,
    "eliminatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoEliminato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumeratoreDocumenti" (
    "prefisso" TEXT NOT NULL,
    "anno" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumeratoreDocumenti_pkey" PRIMARY KEY ("prefisso","anno")
);

-- CreateTable
CREATE TABLE "Frase" (
    "id" TEXT NOT NULL,
    "voceId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "raccomandazione" TEXT NOT NULL DEFAULT '',
    "priorita" TEXT NOT NULL DEFAULT 'media',
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "autoreId" TEXT,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornataIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Frase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Documento_stato_aggiornatoIl_idx" ON "Documento"("stato", "aggiornatoIl");

-- CreateIndex
CREATE INDEX "Documento_richiestaId_idx" ON "Documento"("richiestaId");

-- CreateIndex
CREATE INDEX "Documento_autoreId_idx" ON "Documento"("autoreId");

-- CreateIndex
CREATE INDEX "Documento_revisioneDi_idx" ON "Documento"("revisioneDi");

-- CreateIndex
CREATE UNIQUE INDEX "Documento_numero_revisione_key" ON "Documento"("numero", "revisione");

-- CreateIndex
CREATE INDEX "FotoDocumento_documentoId_ordine_idx" ON "FotoDocumento"("documentoId", "ordine");

-- CreateIndex
CREATE INDEX "Frase_voceId_idx" ON "Frase"("voceId");

-- AddForeignKey
ALTER TABLE "FotoDocumento" ADD CONSTRAINT "FotoDocumento_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

