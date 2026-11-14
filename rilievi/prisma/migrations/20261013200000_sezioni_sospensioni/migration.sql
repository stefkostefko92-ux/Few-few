-- Единадесетата заявка (снимките на отпечатаната карта): бравите и окачванията за смяна — отделно,
-- окачванията с брой и листа 2SG; редът на разделите — по фирма.
-- Написана на ръка върху `prisma migrate diff`. Само добавя: махнатите от листа полета (блокировка,
-- донивелиране, брой шейни, марка на аргано) остават в колоните си със старите отговори, а „Gearless“
-- става „MRL“ само като надпис (стойността GEARLESS остава). Затова предишният код чете базата и след
-- нея — откатът само на кода при паднала сонда е безопасен.

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "sospensioni" BOOLEAN,
ADD COLUMN     "sospensioniNumero" INTEGER,
ADD COLUMN     "ordineSospensioni" JSONB;

-- Модулът е обект {modulo, valori} или нищо — никога число, низ или масив.
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_ordineSospensioni_check"
  CHECK ("ordineSospensioni" IS NULL OR jsonb_typeof("ordineSospensioni") = 'object');

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "ordineSezioni" TEXT[] DEFAULT ARRAY[]::TEXT[];
