-- Октомври 2026 (30-ти, собственикът): листът за интервенция „Servizio assistenza elevatori · Modulo di
-- pronto intervento“ — нова таблица и брояч на номерата във фирмата (от 1, без дупки). Само добавя:
-- предишният код не чете таблицата, а новата колона на фирмата има стойност по подразбиране.

-- CreateEnum
CREATE TYPE "TurnoIntervento" AS ENUM ('MATTINA', 'POMERIGGIO');

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "interventiNumero" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Intervento" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "turno" "TurnoIntervento",
    "indirizzo" VARCHAR(200),
    "citta" VARCHAR(120),
    "tecnici" VARCHAR(300),
    "matricola" VARCHAR(40),
    "voci" JSONB NOT NULL DEFAULT '{}',
    "altro" VARCHAR(1000),
    "prove" BOOLEAN NOT NULL DEFAULT false,
    "oreTecnico" DECIMAL(6,2),
    "oreTotali" DECIMAL(6,2),
    "firmaTecnico" JSONB,
    "firmaTecnicoNome" VARCHAR(120),
    "firmaCliente" JSONB,
    "firmaClienteNome" VARCHAR(120),
    "confermatoAt" TIMESTAMP(3),
    "confermatoById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intervento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Intervento_aziendaId_createdAt_idx" ON "Intervento"("aziendaId", "createdAt");

-- CreateIndex
CREATE INDEX "Intervento_createdById_idx" ON "Intervento"("createdById");

-- CreateIndex
CREATE INDEX "Intervento_updatedById_idx" ON "Intervento"("updatedById");

-- CreateIndex
CREATE INDEX "Intervento_confermatoById_idx" ON "Intervento"("confermatoById");

-- CreateIndex
CREATE UNIQUE INDEX "Intervento_aziendaId_numero_key" ON "Intervento"("aziendaId", "numero");

-- AddForeignKey
ALTER TABLE "Intervento" ADD CONSTRAINT "Intervento_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervento" ADD CONSTRAINT "Intervento_confermatoById_fkey" FOREIGN KEY ("confermatoById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervento" ADD CONSTRAINT "Intervento_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervento" ADD CONSTRAINT "Intervento_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

