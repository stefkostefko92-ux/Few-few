-- Отчет за намесата (rapportino), подписан на място от клиента.
--
-- Днес този лист се пише на хартия и се преписва в офиса, с всичко, което се
-- губи по пътя: часове, вложени материали, кой какво е приел. Подписът се
-- пази като PNG и не е квалифициран електронен подпис по eIDAS — той е
-- доказателство за приемане, каквото е и подписът върху хартията.

-- CreateEnum
CREATE TYPE "EsitoIntervento" AS ENUM ('RISOLTO', 'DA_COMPLETARE', 'RINVIATO', 'NON_RISOLVIBILE');

-- CreateTable
CREATE TABLE "rapportini" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "ordineLavoroId" UUID NOT NULL,
    "tecnicoId" UUID,
    "dataOra" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oreLavoro" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "descrizione" TEXT NOT NULL,
    "esito" "EsitoIntervento" NOT NULL DEFAULT 'RISOLTO',
    "materiali" TEXT,
    "noteInterne" TEXT,
    "firmaCliente" TEXT,
    "firmatarioNome" TEXT,
    "firmatarioRuolo" TEXT,
    "firmatoAt" TIMESTAMP(3),
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rapportini_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rapportini_tenantId_idx" ON "rapportini"("tenantId");

-- CreateIndex
CREATE INDEX "rapportini_ordineLavoroId_idx" ON "rapportini"("ordineLavoroId");

-- CreateIndex
CREATE UNIQUE INDEX "rapportini_tenantId_numero_key" ON "rapportini"("tenantId", "numero");

-- AddForeignKey
ALTER TABLE "rapportini" ADD CONSTRAINT "rapportini_ordineLavoroId_fkey" FOREIGN KEY ("ordineLavoroId") REFERENCES "ordini_lavoro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapportini" ADD CONSTRAINT "rapportini_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "dipendenti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

