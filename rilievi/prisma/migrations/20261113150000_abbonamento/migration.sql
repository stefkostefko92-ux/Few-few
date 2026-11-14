-- Абонаментът на фирмата (#31, #33). Само добавя: досегашните фирми остават без срок (NULL), докато MASTER реши.
ALTER TABLE "Azienda" ADD COLUMN "abbonamentoLivello" INTEGER,
ADD COLUMN "abbonamentoFino" TIMESTAMP(3),
ADD COLUMN "abbonamentoProva" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Azienda_abbonamentoFino_idx" ON "Azienda"("abbonamentoFino");

-- Нивото е 1, 2 или 3; пробният период има край.
ALTER TABLE "Azienda" ADD CONSTRAINT "Azienda_abbonamento_check" CHECK (
  ("abbonamentoLivello" IS NULL OR "abbonamentoLivello" IN (1, 2, 3))
  AND (NOT "abbonamentoProva" OR "abbonamentoFino" IS NOT NULL)
);
