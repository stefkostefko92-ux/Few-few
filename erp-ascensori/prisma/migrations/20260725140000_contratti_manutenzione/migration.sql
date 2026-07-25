-- Договори за поддръжка: canone, покрити импианти, периодичност на посещенията
-- и на фактурирането, срок и мълчаливо подновяване.
--
-- Асансьорна фирма живее от canone di manutenzione, не от единични ордини.
-- Без този модел системата управлява последствията, но не и източника на
-- приходите: всеки месец някой отваря всеки договор и въвежда ръчно ордина и
-- фактурата. `contrattoId` върху ordini_lavoro и fatture свързва родените
-- документи обратно с договора.

-- CreateEnum
CREATE TYPE "StatoContratto" AS ENUM ('BOZZA', 'ATTIVO', 'SOSPESO', 'SCADUTO', 'DISDETTO');

-- CreateEnum
CREATE TYPE "Periodicita" AS ENUM ('MENSILE', 'BIMESTRALE', 'TRIMESTRALE', 'QUADRIMESTRALE', 'SEMESTRALE', 'ANNUALE');

-- AlterTable
ALTER TABLE "fatture" ADD COLUMN     "contrattoId" UUID;

-- AlterTable
ALTER TABLE "ordini_lavoro" ADD COLUMN     "contrattoId" UUID;

-- CreateTable
CREATE TABLE "contratti" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "stato" "StatoContratto" NOT NULL DEFAULT 'BOZZA',
    "oggetto" TEXT NOT NULL,
    "canone" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "aliquotaIva" DECIMAL(5,2) NOT NULL DEFAULT 22,
    "periodicitaVisite" "Periodicita" NOT NULL DEFAULT 'SEMESTRALE',
    "periodicitaFatturazione" "Periodicita" NOT NULL DEFAULT 'TRIMESTRALE',
    "dataInizio" TIMESTAMP(3) NOT NULL,
    "dataFine" TIMESTAMP(3) NOT NULL,
    "rinnovoAutomatico" BOOLEAN NOT NULL DEFAULT true,
    "preavvisoMesi" INTEGER NOT NULL DEFAULT 3,
    "amministratoreId" UUID,
    "condominioId" UUID,
    "prossimaVisita" TIMESTAMP(3),
    "prossimaFattura" TIMESTAMP(3),
    "note" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratti_impianti" (
    "id" UUID NOT NULL,
    "contrattoId" UUID NOT NULL,
    "impiantoId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contratti_impianti_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contratti_tenantId_idx" ON "contratti"("tenantId");

-- CreateIndex
CREATE INDEX "contratti_stato_prossimaVisita_idx" ON "contratti"("stato", "prossimaVisita");

-- CreateIndex
CREATE INDEX "contratti_stato_prossimaFattura_idx" ON "contratti"("stato", "prossimaFattura");

-- CreateIndex
CREATE UNIQUE INDEX "contratti_tenantId_numero_key" ON "contratti"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "contratti_impianti_impiantoId_idx" ON "contratti_impianti"("impiantoId");

-- CreateIndex
CREATE UNIQUE INDEX "contratti_impianti_contrattoId_impiantoId_key" ON "contratti_impianti"("contrattoId", "impiantoId");

-- AddForeignKey
ALTER TABLE "contratti" ADD CONSTRAINT "contratti_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratti" ADD CONSTRAINT "contratti_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "condomini"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratti_impianti" ADD CONSTRAINT "contratti_impianti_contrattoId_fkey" FOREIGN KEY ("contrattoId") REFERENCES "contratti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratti_impianti" ADD CONSTRAINT "contratti_impianti_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordini_lavoro" ADD CONSTRAINT "ordini_lavoro_contrattoId_fkey" FOREIGN KEY ("contrattoId") REFERENCES "contratti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_contrattoId_fkey" FOREIGN KEY ("contrattoId") REFERENCES "contratti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

