-- Единадесетата заявка (снимките на отпечатаната карта): „Gearless“ става „MRL“; бравите и окачванията
-- за смяна — отделно, окачванията с брой и листа 2SG; редът на разделите — по фирма.
-- Написана на ръка върху `prisma migrate diff`. Нищо не се трие: махнатите от листа полета (блокировка,
-- донивелиране, брой шейни, марка на аргано) остават в колоните си със старите отговори.

-- Стойността се преименува на място: картите с „Gearless“ стават „MRL“.
ALTER TYPE "TipoImpianto" RENAME VALUE 'GEARLESS' TO 'MRL';

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "sospensioni" BOOLEAN,
ADD COLUMN     "sospensioniNumero" INTEGER,
ADD COLUMN     "ordineSospensioni" JSONB;

-- Модулът е обект {modulo, valori} или нищо — никога число, низ или масив.
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_ordineSospensioni_check"
  CHECK ("ordineSospensioni" IS NULL OR jsonb_typeof("ordineSospensioni") = 'object');

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "ordineSezioni" TEXT[] DEFAULT ARRAY[]::TEXT[];
