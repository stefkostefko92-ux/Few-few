-- Segnalazioni guasti / centralino 24h
CREATE TABLE "segnalazioni" (
    "id" TEXT NOT NULL,
    "numero" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'GUASTO',
    "priorita" TEXT NOT NULL DEFAULT 'ORDINARIA',
    "stato" TEXT NOT NULL DEFAULT 'APERTA',
    "segnalante" TEXT,
    "telefono" TEXT,
    "canale" TEXT,
    "descrizione" TEXT,
    "dataApertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataChiusura" TIMESTAMP(3),
    "notaChiusura" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "impiantoId" TEXT,
    "ordineLavoroId" TEXT,
    CONSTRAINT "segnalazioni_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "segnalazioni" ADD CONSTRAINT "segnalazioni_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "segnalazioni" ADD CONSTRAINT "segnalazioni_ordineLavoroId_fkey" FOREIGN KEY ("ordineLavoroId") REFERENCES "ordini_lavoro"("id") ON DELETE SET NULL ON UPDATE CASCADE;
