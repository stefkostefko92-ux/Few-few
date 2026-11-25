-- Плащанията (#31) по чл. 12.3–12.4 на условията 2026-11-12: планът, купен по време на пробата или на друг план,
-- започва от края им — нивото се сменя тогава (`abbonamentoCambio*`); по-високото ниво — веднага, с платените
-- дни, превърнати в дни на новото (`creditoCent`). Периодът е този от офертата (`inizio`/`fine`, `base*`). Само добавя.
ALTER TABLE "Azienda" ADD COLUMN "abbonamentoCambioAt" TIMESTAMP(3),
ADD COLUMN "abbonamentoCambioLivello" INTEGER;

ALTER TABLE "Azienda" ADD CONSTRAINT "Azienda_abbonamento_cambio_check" CHECK (
  ("abbonamentoCambioAt" IS NULL) = ("abbonamentoCambioLivello" IS NULL)
  AND ("abbonamentoCambioLivello" IS NULL OR "abbonamentoCambioLivello" IN (1, 2, 3))
  AND ("abbonamentoCambioAt" IS NULL OR "abbonamentoFino" IS NOT NULL)
);

CREATE INDEX "Azienda_abbonamentoCambioAt_idx" ON "Azienda"("abbonamentoCambioAt");

ALTER TABLE "Pagamento" ADD COLUMN "offertaHash" CHAR(64),
ADD COLUMN "creditoCent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "baseFino" TIMESTAMP(3),
ADD COLUMN "baseLivello" INTEGER;

ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_periodo_check" CHECK (
  "creditoCent" >= 0
  AND ("offertaHash" IS NULL OR "offertaHash" ~ '^[0-9a-f]{64}$')
  AND ("inizio" IS NULL OR "fine" IS NULL OR "inizio" < "fine")
);
