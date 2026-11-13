-- Версия 4.1 (собственикът, 12 ноември 2026 — „Направи алтернативата за без VIES. Кредитно известие при връщане и
-- спор“; условията 2026-11-14, чл. 12.9, 12.10 и 25.6). Само добавя.
--  • ConfigPagamenti: ключът за продажбата с 20 % български ДДС при номер извън VIES и другите продажби на фирмата
--    към данъчно незадължени лица в ЕС (за прага от 10 000 € по чл. 59в от Дир. 2006/112/ЕО).
--  • Pagamento.fatturaNumero: номерът на издадената фактура (по избор).
--  • NotaCredito: дължимите кредитни известия (чл. 115 ЗДДС) — по едно за връщане и за спор, решен срещу нас.
--  • Segnalazione.iniziativa: решение за съдържание по инициатива на доставчика (чл. 17 DSA) — без подател.

-- CreateEnum
CREATE TYPE "OrigineNotaCredito" AS ENUM ('RIMBORSO', 'CONTESTAZIONE');



-- AlterTable
ALTER TABLE "ConfigPagamenti" ADD COLUMN     "altreVenditeUeCent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "senzaVies" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Pagamento" ADD COLUMN     "fatturaNumero" VARCHAR(40);

-- AlterTable
ALTER TABLE "Segnalazione" ADD COLUMN     "iniziativa" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "NotaCredito" (
    "id" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "origine" "OrigineNotaCredito" NOT NULL,
    "rimborsoId" TEXT,
    "contestazioneId" VARCHAR(100),
    "imponibileCent" INTEGER NOT NULL,
    "ivaCent" INTEGER NOT NULL,
    "totaleCent" INTEGER NOT NULL,
    "eventoAt" TIMESTAMP(3) NOT NULL,
    "entroIl" TIMESTAMP(3) NOT NULL,
    "numero" VARCHAR(40),
    "emessaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaCredito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaCredito_rimborsoId_key" ON "NotaCredito"("rimborsoId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaCredito_contestazioneId_key" ON "NotaCredito"("contestazioneId");

-- CreateIndex
CREATE INDEX "NotaCredito_pagamentoId_idx" ON "NotaCredito"("pagamentoId");

-- CreateIndex
CREATE INDEX "NotaCredito_emessaAt_idx" ON "NotaCredito"("emessaAt");

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_rimborsoId_fkey" FOREIGN KEY ("rimborsoId") REFERENCES "Rimborso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_contestazioneId_fkey" FOREIGN KEY ("contestazioneId") REFERENCES "Contestazione"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Режимът на ДДС е един от трите (src/pagamenti/importi.ts).
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_regime_check"
  CHECK ("regimeIva" IN ('iva-bg', 'inversione', 'iva-bg-ue'));
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_fattura_numero_check"
  CHECK ("fatturaNumero" IS NULL OR ("fatturataAt" IS NOT NULL AND btrim("fatturaNumero") <> ''));
ALTER TABLE "ConfigPagamenti" ADD CONSTRAINT "ConfigPagamenti_altre_vendite_check"
  CHECK ("altreVenditeUeCent" >= 0);

ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_importi_check"
  CHECK ("imponibileCent" >= 0 AND "ivaCent" >= 0 AND "totaleCent" > 0
         AND "totaleCent" = "imponibileCent" + "ivaCent");
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_origine_check"
  CHECK (
    ("origine" = 'CONTESTAZIONE' AND "contestazioneId" IS NOT NULL AND "rimborsoId" IS NULL)
    OR ("origine" = 'RIMBORSO' AND "contestazioneId" IS NULL)
  );
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_emissione_check"
  CHECK (("numero" IS NULL) = ("emessaAt" IS NULL) AND ("numero" IS NULL OR btrim("numero") <> ''));

-- Решение по собствена инициатива няма подател: името и имейлът остават празни.
ALTER TABLE "Segnalazione" DROP CONSTRAINT "Segnalazione_contatto_check";
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_contatto_check"
  CHECK ("minori" OR "iniziativa" OR ("nome" IS NOT NULL AND "email" IS NOT NULL));
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_iniziativa_check"
  CHECK (NOT "iniziativa" OR ("nome" IS NULL AND "email" IS NULL AND NOT "minori"));
