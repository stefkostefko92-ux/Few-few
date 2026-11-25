-- Версия 4.0 (собственикът, 12 ноември 2026; условията 2026-11-13): само добавя.
--  * Pagamento.vies*: проверката на ДДС номера във VIES при приемането на офертата (чл. 12.10) — номерът на
--    консултацията, кога, и името и адресът, върнати от VIES.
--  * Rimborso: връщане през Revolut върху поръчката на плащане (чл. 12.9), със свой id като Idempotency-Key.
--  * Contestazione: спор за плащане (chargeback), прочетен от Revolut.
--  * ConfigAllarmi: адресът на webhook-а за алармите в Discord — шифрован.
--  * Segnalazione: сигнал за незаконно съдържание (чл. 16 Рег. (ЕС) 2022/2065; условията, чл. 25).

-- CreateEnum
CREATE TYPE "StatoRimborso" AS ENUM ('IN_CORSO', 'COMPLETATO', 'FALLITO');

-- CreateEnum
CREATE TYPE "StatoContestazione" AS ENUM ('DA_RISPONDERE', 'IN_ESAME', 'VINTA', 'PERSA');

-- CreateEnum
CREATE TYPE "StatoSegnalazione" AS ENUM ('RICEVUTA', 'IN_ESAME', 'DECISA', 'RIESAME', 'CHIUSA');

-- CreateEnum
CREATE TYPE "EsitoSegnalazione" AS ENUM ('RIMOSSO', 'LIMITATO', 'NESSUNA_AZIONE', 'NON_VALIDA');

-- AlterTable
ALTER TABLE "Pagamento" ADD COLUMN     "viesAt" TIMESTAMP(3),
ADD COLUMN     "viesConsultazione" VARCHAR(40),
ADD COLUMN     "viesIndirizzo" VARCHAR(500),
ADD COLUMN     "viesNome" VARCHAR(300);

-- CreateTable
CREATE TABLE "Rimborso" (
    "id" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "perPagamentoId" TEXT NOT NULL,
    "importoCent" INTEGER NOT NULL,
    "stato" "StatoRimborso" NOT NULL DEFAULT 'IN_CORSO',
    "revolutRefundId" VARCHAR(100),
    "errore" VARCHAR(30),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completatoAt" TIMESTAMP(3),

    CONSTRAINT "Rimborso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contestazione" (
    "id" VARCHAR(100) NOT NULL,
    "pagamentoId" TEXT,
    "stato" "StatoContestazione" NOT NULL,
    "sottostato" VARCHAR(30),
    "motivo" VARCHAR(300),
    "importoCent" INTEGER NOT NULL,
    "valuta" CHAR(3) NOT NULL,
    "rispostaEntro" TIMESTAMP(3),
    "apertaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contestazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigAllarmi" (
    "id" VARCHAR(10) NOT NULL DEFAULT 'discord',
    "attivo" BOOLEAN NOT NULL DEFAULT false,
    "urlEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ConfigAllarmi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segnalazione" (
    "id" TEXT NOT NULL,
    "riferimento" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dove" VARCHAR(2000) NOT NULL,
    "motivo" VARCHAR(5000) NOT NULL,
    "nome" VARCHAR(200),
    "email" VARCHAR(254),
    "minori" BOOLEAN NOT NULL DEFAULT false,
    "stato" "StatoSegnalazione" NOT NULL DEFAULT 'RICEVUTA',
    "esito" "EsitoSegnalazione",
    "motivazione" VARCHAR(5000),
    "misura" VARCHAR(500),
    "fatti" VARCHAR(5000),
    "fondamento" VARCHAR(500),
    "aziendaId" TEXT,
    "aziendaNome" VARCHAR(120),
    "decisaAt" TIMESTAMP(3),
    "decisaById" TEXT,
    "autorita" VARCHAR(200),
    "autoritaAt" TIMESTAMP(3),
    "riesameAt" TIMESTAMP(3),
    "riesameEsito" VARCHAR(5000),
    "conservaFino" TIMESTAMP(3),

    CONSTRAINT "Segnalazione_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rimborso_revolutRefundId_key" ON "Rimborso"("revolutRefundId");

-- CreateIndex
CREATE INDEX "Rimborso_pagamentoId_idx" ON "Rimborso"("pagamentoId");

-- CreateIndex
CREATE INDEX "Rimborso_perPagamentoId_idx" ON "Rimborso"("perPagamentoId");

-- CreateIndex
CREATE INDEX "Rimborso_createdById_idx" ON "Rimborso"("createdById");

-- CreateIndex
CREATE INDEX "Rimborso_stato_createdAt_idx" ON "Rimborso"("stato", "createdAt");

-- CreateIndex
CREATE INDEX "Contestazione_pagamentoId_idx" ON "Contestazione"("pagamentoId");

-- CreateIndex
CREATE INDEX "Contestazione_stato_idx" ON "Contestazione"("stato");

-- CreateIndex
CREATE INDEX "ConfigAllarmi_updatedById_idx" ON "ConfigAllarmi"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "Segnalazione_riferimento_key" ON "Segnalazione"("riferimento");

-- CreateIndex
CREATE INDEX "Segnalazione_stato_createdAt_idx" ON "Segnalazione"("stato", "createdAt");

-- CreateIndex
CREATE INDEX "Segnalazione_aziendaId_idx" ON "Segnalazione"("aziendaId");

-- CreateIndex
CREATE INDEX "Segnalazione_decisaById_idx" ON "Segnalazione"("decisaById");

-- CreateIndex
CREATE INDEX "Segnalazione_conservaFino_idx" ON "Segnalazione"("conservaFino");

-- AddForeignKey
ALTER TABLE "Rimborso" ADD CONSTRAINT "Rimborso_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rimborso" ADD CONSTRAINT "Rimborso_perPagamentoId_fkey" FOREIGN KEY ("perPagamentoId") REFERENCES "Pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rimborso" ADD CONSTRAINT "Rimborso_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contestazione" ADD CONSTRAINT "Contestazione_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigAllarmi" ADD CONSTRAINT "ConfigAllarmi_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_decisaById_fkey" FOREIGN KEY ("decisaById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Връщането е положителна сума; завършеното има час.
ALTER TABLE "Rimborso" ADD CONSTRAINT "Rimborso_importo_check" CHECK ("importoCent" > 0);
ALTER TABLE "Rimborso" ADD CONSTRAINT "Rimborso_completato_check"
  CHECK (("stato" = 'COMPLETATO') = ("completatoAt" IS NOT NULL));

-- Спорът е за неотрицателна сума.
ALTER TABLE "Contestazione" ADD CONSTRAINT "Contestazione_importo_check" CHECK ("importoCent" >= 0);

-- Включени аларми без адрес няма (както ConfigPagamenti без ключ).
ALTER TABLE "ConfigAllarmi" ADD CONSTRAINT "ConfigAllarmi_attivo_check"
  CHECK (NOT "attivo" OR "urlEnc" IS NOT NULL);
ALTER TABLE "ConfigAllarmi" ADD CONSTRAINT "ConfigAllarmi_id_check" CHECK ("id" = 'discord');

-- Сигналът: текстът не е празен; без име и имейл — само за чл. 16(2)(c) (`minori`); решеният носи изход, мотиви,
-- час и срок на пазене; мярка (премахнато, ограничено) — с мярката, фактите и основанието по чл. 17(3).
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_testo_check"
  CHECK (btrim("dove") <> '' AND btrim("motivo") <> '');
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_contatto_check"
  CHECK ("minori" OR ("nome" IS NOT NULL AND "email" IS NOT NULL));
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_decisione_check"
  CHECK (
    ("esito" IS NULL AND "decisaAt" IS NULL AND "stato" IN ('RICEVUTA', 'IN_ESAME'))
    OR ("esito" IS NOT NULL AND "decisaAt" IS NOT NULL AND "motivazione" IS NOT NULL
        AND "conservaFino" IS NOT NULL AND "stato" IN ('DECISA', 'RIESAME', 'CHIUSA'))
  );
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_misura_check"
  CHECK (
    "esito" IS NULL OR "esito" NOT IN ('RIMOSSO', 'LIMITATO')
    OR ("misura" IS NOT NULL AND "fatti" IS NOT NULL AND "fondamento" IS NOT NULL)
  );
