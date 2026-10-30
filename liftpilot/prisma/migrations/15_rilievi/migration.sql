-- Round 41: Rilievi — the survey sheets of an existing lift (schede di rilievo) with the measurements of the old
-- push-button panels per stop, ported 1:1 from the standalone rilievi portal (commit 174a1e3aa, its migrations init,
-- porte_allarme_bottoniere and quadro_argano). Additive: two new tables and their enums; the existing tables only gain
-- the relations. The search runs on "searchText" with a trigram GIN index (pg_trgm, trusted since PostgreSQL 13).
-- The lists read their page off an index in their own order instead of sorting every sheet of the company: the live
-- list by (company, survey day, creation) newest first, the few trashed ones skipped on the way (PostgreSQL cannot order
-- by an index past an IS NULL column); the trash by (company, deletedAt), newest first.
--
-- Rollback (DATA LOSS: every survey sheet and its measurements; take a backup first — pg_dump of the two tables):
--   DROP TABLE "MisuraBottoniera";
--   DROP TABLE "Scheda";
--   DROP TYPE "RilievoUbicazioneMacchina", "RilievoTipoImpianto", "RilievoTipoPorte", "RilievoTelesoccorsoStato",
--     "RilievoQuadroMarca", "RilievoArganoMarca";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '15_rilievi';
-- pg_trgm stays (harmless, other databases may use it); the audit rows with entity 'Scheda' stay as history.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "RilievoUbicazioneMacchina" AS ENUM ('ALTO', 'BASSO');

-- CreateEnum
CREATE TYPE "RilievoTipoImpianto" AS ENUM ('ELETTRICO', 'IDRAULICO', 'GEARLESS');

-- CreateEnum
CREATE TYPE "RilievoTipoPorte" AS ENUM ('AUTOMATICHE', 'SEMIAUTOMATICHE', 'MANUALI');

-- CreateEnum
CREATE TYPE "RilievoTelesoccorsoStato" AS ENUM ('COMPLETO', 'MANCA_PERIFERICA');

-- CreateEnum
CREATE TYPE "RilievoQuadroMarca" AS ENUM ('PELAZZA', 'MOVILIFT', 'DMG', 'MASTECH', 'ALTRO');

-- CreateEnum
CREATE TYPE "RilievoArganoMarca" AS ENUM ('MONTANARI', 'ALTRO');

-- CreateTable
CREATE TABLE "Scheda" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "indirizzo" VARCHAR(200),
    "marca" VARCHAR(120),
    "matricola" VARCHAR(20),
    "numeroImpianto" VARCHAR(20),
    "buonoLavoro" VARCHAR(60),
    "portataKg" INTEGER,
    "capienzaPersone" INTEGER,
    "fermate" INTEGER,
    "ubicazioneMacchina" "RilievoUbicazioneMacchina"[],
    "ubicazioneCassettina" INTEGER,
    "parcheggio" VARCHAR(300),
    "tipoImpianto" "RilievoTipoImpianto"[],
    "tipoPorte" "RilievoTipoPorte"[],
    "operatoreMarca" VARCHAR(120),
    "lucePorte" VARCHAR(60),
    "operatoreTensione" VARCHAR(60),
    "doppioAccesso" BOOLEAN,
    "bloccaPortine" BOOLEAN,
    "autolivellamento" BOOLEAN,
    "pattinoRetrattile" BOOLEAN,
    "pattinoRetrattileNumero" INTEGER,
    "serrature" BOOLEAN,
    "serratureNumero" INTEGER,
    "serratureTipo" VARCHAR(120),
    "luceVanoSostituire" BOOLEAN,
    "funiDiametroMm" DECIMAL(6,2),
    "funiTrefoli" INTEGER,
    "funiNumero" INTEGER,
    "funiLunghezzaM" DECIMAL(8,2),
    "limitatoreTipo" VARCHAR(120),
    "funicellaDiametroMm" DECIMAL(6,2),
    "funicellaLunghezzaM" DECIMAL(8,2),
    "tenditore" VARCHAR(120),
    "caviNumero" INTEGER,
    "caviConduttori" INTEGER,
    "caviLunghezzaM" DECIMAL(8,2),
    "telesoccorso" BOOLEAN,
    "telesoccorsoStato" "RilievoTelesoccorsoStato",
    "allarmePortineria" BOOLEAN,
    "displayPortineria" BOOLEAN,
    "noteQuadretto" TEXT,
    "noteImpianto" TEXT,
    "noteBottoniere" TEXT,
    "bottoniereMisure" BOOLEAN,
    "lavoriExtra" TEXT,
    "quadroMarca" "RilievoQuadroMarca",
    "quadroMarcaAltro" VARCHAR(120),
    "quadroOrdine" BOOLEAN,
    "ordineQuadro" JSONB,
    "arganoMarca" "RilievoArganoMarca",
    "arganoMarcaAltro" VARCHAR(120),
    "arganoPreventivo" BOOLEAN,
    "preventivoArgano" JSONB,
    "searchText" TEXT NOT NULL DEFAULT '',
    "companyId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scheda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MisuraBottoniera" (
    "id" TEXT NOT NULL,
    "schedaId" TEXT NOT NULL,
    "fermata" INTEGER NOT NULL,
    "piano" VARCHAR(20),
    "lunghezzaMm" DECIMAL(7,2),
    "larghezzaMm" DECIMAL(7,2),
    "interasseSuperiore" VARCHAR(60),
    "interasseInferiore" VARCHAR(60),
    "display" BOOLEAN,

    CONSTRAINT "MisuraBottoniera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scheda_companyId_data_createdAt_idx" ON "Scheda"("companyId", "data" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Scheda_companyId_deletedAt_idx" ON "Scheda"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Scheda_data_idx" ON "Scheda"("data");

-- CreateIndex
CREATE INDEX "Scheda_matricola_idx" ON "Scheda"("matricola");

-- CreateIndex
CREATE INDEX "Scheda_numeroImpianto_idx" ON "Scheda"("numeroImpianto");

-- CreateIndex
CREATE INDEX "Scheda_createdById_idx" ON "Scheda"("createdById");

-- CreateIndex
CREATE INDEX "Scheda_updatedById_idx" ON "Scheda"("updatedById");

-- CreateIndex
CREATE INDEX "Scheda_deletedById_idx" ON "Scheda"("deletedById");

-- CreateIndex
CREATE INDEX "Scheda_searchText_idx" ON "Scheda" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "MisuraBottoniera_schedaId_fermata_key" ON "MisuraBottoniera"("schedaId", "fermata");

-- AddForeignKey
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MisuraBottoniera" ADD CONSTRAINT "MisuraBottoniera_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per stop, the stops being 1..300 (the upper bound of "fermate", src/lib/rilievi/fields.ts).
ALTER TABLE "MisuraBottoniera" ADD CONSTRAINT "MisuraBottoniera_fermata_check" CHECK ("fermata" BETWEEN 1 AND 300);

-- The supplier modules are a JSON object {modulo, valori} or a real SQL NULL (never JSON null).
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_ordineQuadro_check"
  CHECK ("ordineQuadro" IS NULL OR jsonb_typeof("ordineQuadro") = 'object');
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_preventivoArgano_check"
  CHECK ("preventivoArgano" IS NULL OR jsonb_typeof("preventivoArgano") = 'object');
