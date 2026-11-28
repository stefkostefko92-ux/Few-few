-- Фактурата и изгубеният спор (прегледът на Данъчника, 28 ноември 2026 — H2, M1). Само добавя.

-- Датата на фактурата (денят на документа; `fatturataAt` остава моментът на отметката). Досегашните — без дата.
ALTER TABLE "Pagamento" ADD COLUMN "fatturaData" TIMESTAMP(3);
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_fatturaData_check" CHECK (
  "fatturaData" IS NULL OR "fatturataAt" IS NOT NULL
);

-- Изгубеният спор: кредитно известие (разваляне) или никакво (неплащане) — избира MASTER, веднъж.
CREATE TYPE "DecisioneContestazione" AS ENUM ('NOTA_CREDITO', 'NESSUNA_NOTA');
ALTER TABLE "Contestazione" ADD COLUMN "decisione" "DecisioneContestazione";
ALTER TABLE "Contestazione" ADD COLUMN "decisaAt" TIMESTAMP(3);
ALTER TABLE "Contestazione" ADD CONSTRAINT "Contestazione_decisione_check" CHECK (
  ("decisione" IS NULL) = ("decisaAt" IS NULL)
);
