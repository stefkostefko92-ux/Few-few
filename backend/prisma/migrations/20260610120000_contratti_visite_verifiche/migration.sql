-- Moduli mancanti per il settore ascensoristico (DPR 162/99):
-- contratti di manutenzione, visite programmate, verifiche periodiche biennali

CREATE TABLE "contratti" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ORDINARIA',
    "stato" TEXT NOT NULL DEFAULT 'ATTIVO',
    "canoneAnnuo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "visiteAnno" INTEGER NOT NULL DEFAULT 2,
    "dataInizio" TIMESTAMP(3),
    "dataFine" TIMESTAMP(3),
    "rinnovoAutomatico" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "impiantoId" TEXT,
    "amministratoreId" TEXT,
    CONSTRAINT "contratti_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contratti_numero_key" ON "contratti"("numero");

CREATE TABLE "visite_manutenzione" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ORDINARIA',
    "stato" TEXT NOT NULL DEFAULT 'PROGRAMMATA',
    "dataProgrammata" TIMESTAMP(3),
    "dataEsecuzione" TIMESTAMP(3),
    "esito" TEXT,
    "descrizione" TEXT,
    "anomalie" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "impiantoId" TEXT,
    "contrattoId" TEXT,
    "tecnicoId" TEXT,
    CONSTRAINT "visite_manutenzione_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verifiche_periodiche" (
    "id" TEXT NOT NULL,
    "dataVerifica" TIMESTAMP(3),
    "organismo" TEXT,
    "esito" TEXT,
    "prescrizioni" TEXT,
    "prossimaScadenza" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "impiantoId" TEXT,
    CONSTRAINT "verifiche_periodiche_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contratti" ADD CONSTRAINT "contratti_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contratti" ADD CONSTRAINT "contratti_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visite_manutenzione" ADD CONSTRAINT "visite_manutenzione_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visite_manutenzione" ADD CONSTRAINT "visite_manutenzione_contrattoId_fkey" FOREIGN KEY ("contrattoId") REFERENCES "contratti"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visite_manutenzione" ADD CONSTRAINT "visite_manutenzione_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "dipendenti"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "verifiche_periodiche" ADD CONSTRAINT "verifiche_periodiche_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE SET NULL ON UPDATE CASCADE;
