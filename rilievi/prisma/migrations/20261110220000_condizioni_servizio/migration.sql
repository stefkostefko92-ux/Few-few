-- Условията за услугата и доказателствата (собственикът, 10 ноември 2026: „Fai tutto in modo tale da
-- essere legalmente coperti e minimamente esposti“): кой какво е приел и всеки изтеглен PDF с изчисление.
-- Само добавя. Таблиците на доказателствата нямат връзки към човека и фирмата — остават и след тях.

-- CreateEnum
CREATE TYPE "TipoTesto" AS ENUM ('CONDIZIONI', 'REGOLE');

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "condizioniVersione" VARCHAR(20);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "regoleVersione" VARCHAR(20);

-- CreateTable
CREATE TABLE "TestoLegale" (
    "tipo" "TipoTesto" NOT NULL,
    "versione" VARCHAR(20) NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "testo" TEXT NOT NULL,
    "registratoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestoLegale_pkey" PRIMARY KEY ("tipo","versione")
);

-- CreateTable
CREATE TABLE "Accettazione" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "TipoTesto" NOT NULL,
    "versione" VARCHAR(20) NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "clausole" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT NOT NULL,
    "userNome" VARCHAR(120) NOT NULL,
    "userEmail" VARCHAR(254) NOT NULL,
    "aziendaId" TEXT,
    "aziendaNome" VARCHAR(120),
    "ruolo" "Role",
    "ragioneSociale" VARCHAR(200),
    "sede" VARCHAR(300),
    "partitaIva" VARCHAR(20),
    "otpEmail" VARCHAR(254),
    "otpInviatoAt" TIMESTAMP(3),
    "otpVerificatoAt" TIMESTAMP(3),
    "ip" VARCHAR(45),
    "userAgent" VARCHAR(300),
    "copiaHash" CHAR(64),
    "sigillo" CHAR(64) NOT NULL,
    "conservaFino" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accettazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmaCondizioni" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "versione" VARCHAR(20) NOT NULL,
    "dichiarati" JSONB NOT NULL,
    "codiceHmac" CHAR(64) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "inviatoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scadeAt" TIMESTAMP(3) NOT NULL,
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "usataAt" TIMESTAMP(3),

    CONSTRAINT "FirmaCondizioni_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissioneCalcolo" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calcolo" VARCHAR(20) NOT NULL,
    "impronta" VARCHAR(14) NOT NULL,
    "build" VARCHAR(10) NOT NULL,
    "pdfHash" CHAR(64) NOT NULL,
    "dati" JSONB NOT NULL,
    "risultato" JSONB NOT NULL,
    "calcoloId" TEXT,
    "schedaId" TEXT,
    "aziendaId" TEXT NOT NULL,
    "aziendaNome" VARCHAR(120) NOT NULL,
    "userId" TEXT NOT NULL,
    "userNome" VARCHAR(120) NOT NULL,
    "userEmail" VARCHAR(254) NOT NULL,
    "sigillo" CHAR(64) NOT NULL,
    "conservaFino" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmissioneCalcolo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Accettazione_userId_tipo_versione_idx" ON "Accettazione"("userId", "tipo", "versione");

-- CreateIndex
CREATE INDEX "Accettazione_aziendaId_tipo_versione_idx" ON "Accettazione"("aziendaId", "tipo", "versione");

-- CreateIndex
CREATE INDEX "Accettazione_conservaFino_idx" ON "Accettazione"("conservaFino");

-- CreateIndex
CREATE INDEX "FirmaCondizioni_userId_idx" ON "FirmaCondizioni"("userId");

-- CreateIndex
CREATE INDEX "FirmaCondizioni_scadeAt_idx" ON "FirmaCondizioni"("scadeAt");

-- CreateIndex
CREATE INDEX "EmissioneCalcolo_aziendaId_at_idx" ON "EmissioneCalcolo"("aziendaId", "at");

-- CreateIndex
CREATE INDEX "EmissioneCalcolo_impronta_idx" ON "EmissioneCalcolo"("impronta");

-- CreateIndex
CREATE INDEX "EmissioneCalcolo_conservaFino_idx" ON "EmissioneCalcolo"("conservaFino");

-- AddForeignKey
ALTER TABLE "FirmaCondizioni" ADD CONSTRAINT "FirmaCondizioni_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

