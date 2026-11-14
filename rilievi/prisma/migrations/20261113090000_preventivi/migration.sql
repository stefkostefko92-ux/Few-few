-- Офертите (C1): включването по фирма (само MASTER), номерът на фирмата, условията за плащане, офертата и
-- ценоразписът. Само добавя; всички фирми започват с изключени оферти.

-- CreateEnum
CREATE TYPE "StatoPreventivo" AS ENUM ('BOZZA', 'INVIATO', 'ACCETTATO', 'RIFIUTATO');


-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "preventiviAttivi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preventiviNumero" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preventivoCondizioni" VARCHAR(2000);

-- CreateTable
CREATE TABLE "Preventivo" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "schedaId" TEXT,
    "numero" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "validitaGiorni" INTEGER NOT NULL DEFAULT 30,
    "cliente" VARCHAR(200) NOT NULL,
    "clienteIndirizzo" VARCHAR(300),
    "clientePiva" VARCHAR(20),
    "clienteEmail" VARCHAR(254),
    "oggetto" VARCHAR(300) NOT NULL,
    "impianto" VARCHAR(300),
    "righe" JSONB NOT NULL DEFAULT '[]',
    "note" VARCHAR(4000),
    "condizioni" VARCHAR(2000),
    "imponibile" INTEGER NOT NULL DEFAULT 0,
    "imposta" INTEGER NOT NULL DEFAULT 0,
    "totale" INTEGER NOT NULL DEFAULT 0,
    "stato" "StatoPreventivo" NOT NULL DEFAULT 'BOZZA',
    "statoAt" TIMESTAMP(3),
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preventivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoceListino" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "codice" VARCHAR(30),
    "descrizione" VARCHAR(300) NOT NULL,
    "unita" VARCHAR(12) NOT NULL,
    "prezzo" INTEGER NOT NULL,
    "iva" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoceListino_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Preventivo_aziendaId_createdAt_idx" ON "Preventivo"("aziendaId", "createdAt");

-- CreateIndex
CREATE INDEX "Preventivo_schedaId_idx" ON "Preventivo"("schedaId");

-- CreateIndex
CREATE INDEX "Preventivo_createdById_idx" ON "Preventivo"("createdById");

-- CreateIndex
CREATE INDEX "Preventivo_updatedById_idx" ON "Preventivo"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "Preventivo_aziendaId_numero_key" ON "Preventivo"("aziendaId", "numero");

-- CreateIndex
CREATE INDEX "VoceListino_aziendaId_descrizione_idx" ON "VoceListino"("aziendaId", "descrizione");

-- CreateIndex
CREATE UNIQUE INDEX "VoceListino_aziendaId_codice_key" ON "VoceListino"("aziendaId", "codice");

-- AddForeignKey
ALTER TABLE "Preventivo" ADD CONSTRAINT "Preventivo_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preventivo" ADD CONSTRAINT "Preventivo_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preventivo" ADD CONSTRAINT "Preventivo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preventivo" ADD CONSTRAINT "Preventivo_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoceListino" ADD CONSTRAINT "VoceListino_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Търсенето в списъка (номер, клиент, предмет, уредба) — като картите.
CREATE INDEX "Preventivo_searchText_idx" ON "Preventivo" USING GIN ("searchText" gin_trgm_ops);

-- Парите са цели центове (preventivi/importi.ts): сборът е винаги облагаемо + ДДС; номерът — от 1.
ALTER TABLE "Preventivo" ADD CONSTRAINT "Preventivo_importi_check" CHECK (
  jsonb_typeof("righe") = 'array'
  AND "numero" > 0
  AND "validitaGiorni" BETWEEN 1 AND 365
  AND "imponibile" >= 0 AND "imposta" >= 0
  AND "totale" = "imponibile" + "imposta"
);
ALTER TABLE "VoceListino" ADD CONSTRAINT "VoceListino_check" CHECK (
  "prezzo" BETWEEN 0 AND 1000000000 AND "iva" IN (22, 10, 4)
);
ALTER TABLE "Azienda" ADD CONSTRAINT "Azienda_preventiviNumero_check" CHECK ("preventiviNumero" >= 0);
