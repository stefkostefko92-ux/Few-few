-- Плащанията на плановете през Revolut Business (#31). Само добавя.
-- CreateEnum
CREATE TYPE "AmbienteRevolut" AS ENUM ('SANDBOX', 'PRODUZIONE');

-- CreateEnum
CREATE TYPE "StatoPagamento" AS ENUM ('IN_ATTESA', 'COMPLETATO', 'FALLITO', 'ANNULLATO', 'SCADUTO');

-- CreateTable
CREATE TABLE "ConfigPagamenti" (
    "id" VARCHAR(10) NOT NULL DEFAULT 'revolut',
    "attivo" BOOLEAN NOT NULL DEFAULT false,
    "ambiente" "AmbienteRevolut" NOT NULL DEFAULT 'SANDBOX',
    "chiaveEnc" TEXT,
    "webhookId" VARCHAR(100),
    "webhookSegretoEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ConfigPagamenti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PianoAbbonamento" (
    "id" TEXT NOT NULL,
    "livello" INTEGER NOT NULL,
    "mesi" INTEGER NOT NULL,
    "prezzoCent" INTEGER NOT NULL,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PianoAbbonamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT,
    "aziendaNome" VARCHAR(120) NOT NULL,
    "pianoId" TEXT,
    "livello" INTEGER NOT NULL,
    "mesi" INTEGER NOT NULL,
    "imponibileCent" INTEGER NOT NULL,
    "ivaCent" INTEGER NOT NULL,
    "totaleCent" INTEGER NOT NULL,
    "regimeIva" VARCHAR(20) NOT NULL,
    "ragioneSociale" VARCHAR(200) NOT NULL,
    "sede" VARCHAR(300) NOT NULL,
    "partitaIva" VARCHAR(20) NOT NULL,
    "stato" "StatoPagamento" NOT NULL DEFAULT 'IN_ATTESA',
    "ambiente" "AmbienteRevolut" NOT NULL,
    "revolutOrderId" VARCHAR(100),
    "checkoutUrl" VARCHAR(500),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completatoAt" TIMESTAMP(3),
    "inizio" TIMESTAMP(3),
    "fine" TIMESTAMP(3),

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccettazioneOfferta" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "userNome" VARCHAR(120) NOT NULL,
    "userEmail" VARCHAR(254) NOT NULL,
    "aziendaId" TEXT,
    "aziendaNome" VARCHAR(120) NOT NULL,
    "ragioneSociale" VARCHAR(200) NOT NULL,
    "sede" VARCHAR(300) NOT NULL,
    "partitaIva" VARCHAR(20) NOT NULL,
    "livello" INTEGER NOT NULL,
    "mesi" INTEGER NOT NULL,
    "imponibileCent" INTEGER NOT NULL,
    "ivaCent" INTEGER NOT NULL,
    "totaleCent" INTEGER NOT NULL,
    "versione" VARCHAR(20) NOT NULL,
    "testo" TEXT NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "ip" VARCHAR(45),
    "userAgent" VARCHAR(300),
    "pagamentoId" TEXT NOT NULL,
    "sigillo" CHAR(64) NOT NULL,
    "conservaFino" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccettazioneOfferta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfigPagamenti_updatedById_idx" ON "ConfigPagamenti"("updatedById");

-- CreateIndex
CREATE INDEX "PianoAbbonamento_attivo_idx" ON "PianoAbbonamento"("attivo");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_revolutOrderId_key" ON "Pagamento"("revolutOrderId");

-- CreateIndex
CREATE INDEX "Pagamento_aziendaId_idx" ON "Pagamento"("aziendaId");

-- CreateIndex
CREATE INDEX "Pagamento_pianoId_idx" ON "Pagamento"("pianoId");

-- CreateIndex
CREATE INDEX "Pagamento_createdById_idx" ON "Pagamento"("createdById");

-- CreateIndex
CREATE INDEX "Pagamento_stato_createdAt_idx" ON "Pagamento"("stato", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccettazioneOfferta_pagamentoId_key" ON "AccettazioneOfferta"("pagamentoId");

-- CreateIndex
CREATE INDEX "AccettazioneOfferta_aziendaId_idx" ON "AccettazioneOfferta"("aziendaId");

-- CreateIndex
CREATE INDEX "AccettazioneOfferta_conservaFino_idx" ON "AccettazioneOfferta"("conservaFino");

-- AddForeignKey
ALTER TABLE "ConfigPagamenti" ADD CONSTRAINT "ConfigPagamenti_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_pianoId_fkey" FOREIGN KEY ("pianoId") REFERENCES "PianoAbbonamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Един ред на настройката; включени плащания — с ключ.
ALTER TABLE "ConfigPagamenti" ADD CONSTRAINT "ConfigPagamenti_check" CHECK (
  "id" = 'revolut' AND (NOT "attivo" OR "chiaveEnc" IS NOT NULL)
);

-- Нивото 1–3, срокът 1–36 месеца, цената от 1 до 100 000 € в центове.
ALTER TABLE "PianoAbbonamento" ADD CONSTRAINT "PianoAbbonamento_check" CHECK (
  "livello" IN (1, 2, 3) AND "mesi" BETWEEN 1 AND 36 AND "prezzoCent" BETWEEN 100 AND 10000000
);

-- Сумите — цели центове, общото = основа + ДДС; завършено плащане има поръчка и период.
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_check" CHECK (
  "livello" IN (1, 2, 3) AND "mesi" BETWEEN 1 AND 36
  AND "imponibileCent" > 0 AND "ivaCent" >= 0 AND "totaleCent" = "imponibileCent" + "ivaCent"
  AND ("stato" <> 'COMPLETATO' OR ("revolutOrderId" IS NOT NULL AND "completatoAt" IS NOT NULL AND "fine" IS NOT NULL))
);

ALTER TABLE "AccettazioneOfferta" ADD CONSTRAINT "AccettazioneOfferta_check" CHECK (
  "totaleCent" = "imponibileCent" + "ivaCent" AND "hash" ~ '^[0-9a-f]{64}$' AND "sigillo" ~ '^[0-9a-f]{64}$'
);
