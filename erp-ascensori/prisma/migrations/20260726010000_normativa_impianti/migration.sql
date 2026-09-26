-- Нормативният слой на асансьора — D.P.R. 162/1999 и D.M. 37/2008.
--
-- Дотук продуктът знаеше „prossimaRevisione": една дата, без протокол, без
-- орган и без начин да се докаже, че проверката изобщо е минала. Това е
-- достатъчно за напомняне, но не и за контрол — а именно контролът е причината
-- клиентът да купи такъв софтуер.
--
-- Три неща влизат:
--
--   • Уредбата получава правната си самоличност: номерът от ОБЩИНАТА (чл. 12),
--     режимът, по който е пусната в служба, и органът, който я проверява.
--   • Проверката по чл. 13/14 става ЗАПИС с изход, протокол и предписания, а
--     не дата. Отрицателният изход води до FERMO_AMMINISTRATIVO — спиране ПО
--     ЗАКОН, което поддържащата фирма не може да отмени сама (чл. 14, ал. 2).
--   • Рапортичката носи проверките по чл. 15, ал. 4 като отделни полета.
--     Свободният текст „всичко наред" не доказва нищо: при злополука се пита
--     кое точно е проверено. `NULL` значи „не е гледано", не „наред".
--
-- Само добавящa: нито една колона не се маха, нито един ред не се пипа.

-- CreateEnum
CREATE TYPE "TipoImpianto" AS ENUM ('ASCENSORE', 'MONTACARICHI', 'PIATTAFORMA_ELEVATRICE', 'MONTASCALE', 'SCALA_MOBILE', 'MONTAVIVANDE');

-- CreateEnum
CREATE TYPE "RegimeImpianto" AS ENUM ('PREESISTENTE', 'DIRETTIVA_95_16', 'DIRETTIVA_2014_33');

-- CreateEnum
CREATE TYPE "TipoVerifica" AS ENUM ('PERIODICA', 'STRAORDINARIA', 'MESSA_IN_SERVIZIO');

-- CreateEnum
CREATE TYPE "EsitoVerifica" AS ENUM ('POSITIVO', 'CON_PRESCRIZIONI', 'NEGATIVO');

-- CreateEnum
CREATE TYPE "TipoIntervento" AS ENUM ('MANUTENZIONE_ORDINARIA', 'VERIFICA_SEMESTRALE', 'RIPARAZIONE', 'EMERGENZA', 'SOCCORSO', 'SOSTITUZIONE_COMPONENTI');

-- AlterEnum
ALTER TYPE "StatoImpianto" ADD VALUE 'FERMO_AMMINISTRATIVO';

-- AlterTable
ALTER TABLE "impianti" ADD COLUMN     "comune" TEXT,
ADD COLUMN     "dataComunicazione" TIMESTAMP(3),
ADD COLUMN     "manutentoreDal" TIMESTAMP(3),
ADD COLUMN     "matricolaComune" TEXT,
ADD COLUMN     "organismoNotificato" TEXT,
ADD COLUMN     "persone" INTEGER,
ADD COLUMN     "regime" "RegimeImpianto" NOT NULL DEFAULT 'DIRETTIVA_2014_33',
ADD COLUMN     "tipo" "TipoImpianto" NOT NULL DEFAULT 'ASCENSORE',
ADD COLUMN     "velocita" DECIMAL(5,3);

-- AlterTable
ALTER TABLE "rapportini" ADD COLUMN     "impiantoId" UUID,
ADD COLUMN     "tipoIntervento" "TipoIntervento" NOT NULL DEFAULT 'MANUTENZIONE_ORDINARIA',
ADD COLUMN     "vCitofonoAllarme" BOOLEAN,
ADD COLUMN     "vFuni" BOOLEAN,
ADD COLUMN     "vIlluminazioneEmergenza" BOOLEAN,
ADD COLUMN     "vIsolamentoElettrico" BOOLEAN,
ADD COLUMN     "vLimitatoreVelocita" BOOLEAN,
ADD COLUMN     "vMessaTerra" BOOLEAN,
ADD COLUMN     "vParacadute" BOOLEAN,
ADD COLUMN     "vPorteSerrature" BOOLEAN;

-- CreateTable
CREATE TABLE "verifiche_impianti" (
    "id" UUID NOT NULL,
    "impiantoId" UUID NOT NULL,
    "tipo" "TipoVerifica" NOT NULL DEFAULT 'PERIODICA',
    "data" TIMESTAMP(3) NOT NULL,
    "esito" "EsitoVerifica" NOT NULL,
    "organismo" TEXT,
    "numeroVerbale" TEXT,
    "prescrizioni" TEXT,
    "scadenzaPrescrizioni" TIMESTAMP(3),
    "prossimaVerifica" TIMESTAMP(3),
    "documentoId" UUID,
    "note" TEXT,
    "utenteId" UUID,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifiche_impianti_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verifiche_impianti_tenantId_idx" ON "verifiche_impianti"("tenantId");

-- CreateIndex
CREATE INDEX "verifiche_impianti_impiantoId_idx" ON "verifiche_impianti"("impiantoId");

-- CreateIndex
CREATE INDEX "rapportini_impiantoId_idx" ON "rapportini"("impiantoId");

-- AddForeignKey
ALTER TABLE "verifiche_impianti" ADD CONSTRAINT "verifiche_impianti_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documenti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifiche_impianti" ADD CONSTRAINT "verifiche_impianti_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapportini" ADD CONSTRAINT "rapportini_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Row-Level Security за новата таблица ──────────────────────────────────
--
-- Условието е дословно същото като в `20260725190000_row_level_security`
-- (обяснението е в `src/lib/rls.ts`). Нова таблица с `tenantId` БЕЗ политика е
-- тиха дупка в изолацията между фирмите.

ALTER TABLE "verifiche_impianti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verifiche_impianti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "verifiche_impianti";
CREATE POLICY tenant_isolation ON "verifiche_impianti"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );

-- Рапортичките вече сочат уредбата пряко. За заварените я извеждаме от ордина:
-- връзката съществуваше, само беше през две таблици.
UPDATE "rapportini" r
   SET "impiantoId" = o."impiantoId"
  FROM "ordini_lavoro" o
 WHERE o.id = r."ordineLavoroId"
   AND r."impiantoId" IS NULL
   AND o."impiantoId" IS NOT NULL;
