-- Фискалният слой, който липсваше: кондоминиумът като получател, удържането
-- 4 %, плащанията и истинският път през Sistema di Interscambio.
--
-- Дотук фактурата се адресираше до АДМИНИСТРАТОРА (студиото), а той е само
-- представител: получателят е кондоминиумът, със свой данъчен номер. Освен
-- че документът отиваше на грешно лице, липсваше и удържането по чл. 25-ter
-- D.P.R. 600/1973, което кондоминиумът е длъжен да направи.
--
-- Миграцията е само добавяща: нито една колона не се маха и нито един ред не
-- се пипа освен пренасянето на заварените статуси (в края).

-- CreateEnum
CREATE TYPE "StatoSdi" AS ENUM ('NON_INVIATA', 'GENERATA', 'INVIATA', 'CONSEGNATA', 'MANCATA_CONSEGNA', 'SCARTATA', 'ACCETTATA', 'RIFIUTATA', 'DECORSI_TERMINI');

-- CreateEnum
CREATE TYPE "TipoNotificaSdi" AS ENUM ('RC', 'NS', 'MC', 'NE', 'DT', 'AT');

-- CreateEnum
CREATE TYPE "StatoPagamentoFattura" AS ENUM ('NON_PAGATA', 'PARZIALE', 'PAGATA');

-- AlterTable
ALTER TABLE "condomini" ADD COLUMN     "codiceSdi" TEXT,
ADD COLUMN     "pec" TEXT,
ADD COLUMN     "sostitutoImposta" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "fatture" ADD COLUMN     "cig" TEXT,
ADD COLUMN     "condizioniPagamento" TEXT NOT NULL DEFAULT 'TP02',
ADD COLUMN     "condominioId" UUID,
ADD COLUMN     "cup" TEXT,
ADD COLUMN     "dataInvioSdi" TIMESTAMP(3),
ADD COLUMN     "identificativoSdi" TEXT,
ADD COLUMN     "modalitaPagamento" TEXT NOT NULL DEFAULT 'MP05',
ADD COLUMN     "progressivoInvio" TEXT,
ADD COLUMN     "regimeBeniSignificativi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ritenuta" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ritenutaAliquota" DECIMAL(5,2) NOT NULL DEFAULT 4,
ADD COLUMN     "ritenutaCausale" TEXT NOT NULL DEFAULT 'W',
ADD COLUMN     "ritenutaImporto" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ritenutaTipo" TEXT NOT NULL DEFAULT 'RT02',
ADD COLUMN     "ritenutaVersata" TIMESTAMP(3),
ADD COLUMN     "scadenzaRinvioSdi" TIMESTAMP(3),
ADD COLUMN     "splitPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "statoPagamento" "StatoPagamentoFattura" NOT NULL DEFAULT 'NON_PAGATA',
ADD COLUMN     "statoSdi" "StatoSdi" NOT NULL DEFAULT 'NON_INVIATA',
ADD COLUMN     "totalePagato" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "voci_fattura" ADD COLUMN     "beneSignificativo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "pagamenti" (
    "id" UUID NOT NULL,
    "fatturaId" UUID NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importo" DECIMAL(12,2) NOT NULL,
    "modalita" TEXT NOT NULL DEFAULT 'MP05',
    "riferimento" TEXT,
    "note" TEXT,
    "utenteId" UUID,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagamenti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifiche_sdi" (
    "id" UUID NOT NULL,
    "fatturaId" UUID NOT NULL,
    "tipo" "TipoNotificaSdi" NOT NULL,
    "identificativoSdi" TEXT,
    "dataOra" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descrizione" TEXT,
    "errori" JSONB,
    "nomeFile" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifiche_sdi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contatori_sdi" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contatori_sdi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagamenti_tenantId_idx" ON "pagamenti"("tenantId");

-- CreateIndex
CREATE INDEX "pagamenti_fatturaId_idx" ON "pagamenti"("fatturaId");

-- CreateIndex
CREATE INDEX "notifiche_sdi_tenantId_idx" ON "notifiche_sdi"("tenantId");

-- CreateIndex
CREATE INDEX "notifiche_sdi_fatturaId_idx" ON "notifiche_sdi"("fatturaId");

-- CreateIndex
CREATE UNIQUE INDEX "contatori_sdi_tenantId_key" ON "contatori_sdi"("tenantId");

-- CreateIndex
CREATE INDEX "fatture_condominioId_idx" ON "fatture"("condominioId");

-- CreateIndex
CREATE INDEX "fatture_statoSdi_idx" ON "fatture"("statoSdi");

-- AddForeignKey
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "condomini"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamenti" ADD CONSTRAINT "pagamenti_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "fatture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifiche_sdi" ADD CONSTRAINT "notifiche_sdi_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "fatture"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Пренасяне на заварените данни ─────────────────────────────────────────
--
-- Досега `stato` носеше едновременно жизнения цикъл на документа, пътя му през
-- SDI и това дали е платен. Разделяме ги, без да губим каквото е било вярно.

UPDATE "fatture" SET "statoPagamento" = 'PAGATA', "totalePagato" = "totaleLordo"
  WHERE "stato" = 'PAGATA';

UPDATE "fatture" SET "statoSdi" = 'INVIATA', "dataInvioSdi" = "updatedAt"
  WHERE "stato" IN ('INVIATA', 'PAGATA', 'SCADUTA');

-- ── Row-Level Security за новите таблици ──────────────────────────────────
--
-- Условието е дословно същото като в `20260725190000_row_level_security`
-- (виж `src/lib/rls.ts` за обяснението на всяка част). Нова таблица с
-- `tenantId` БЕЗ политика е тиха дупка в изолацията между фирмите — затова
-- всяка миграция, която добавя такава, добавя и политиката.

ALTER TABLE "pagamenti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pagamenti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pagamenti";
CREATE POLICY tenant_isolation ON "pagamenti"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );

ALTER TABLE "notifiche_sdi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifiche_sdi" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "notifiche_sdi";
CREATE POLICY tenant_isolation ON "notifiche_sdi"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );

ALTER TABLE "contatori_sdi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contatori_sdi" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "contatori_sdi";
CREATE POLICY tenant_isolation ON "contatori_sdi"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
