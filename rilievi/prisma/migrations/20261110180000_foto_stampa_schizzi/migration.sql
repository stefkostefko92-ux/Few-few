-- Собственикът, 10 ноември 2026: „facciamo scegliere all'utente nelle impostazioni di stampa con
-- un'anteprima la dimensione e l'ordine delle foto, attiva gli schizzi per tutti gli utenti e togli
-- l'opzione per disattivarli dalle impostazioni. Gli schizzi diventano attivi di default.“
-- Написана на ръка върху `prisma migrate diff`; добавя и включва, не трие.

-- CreateEnum
CREATE TYPE "FotoDimensione" AS ENUM ('PICCOLE', 'MEDIE', 'GRANDI', 'UNA');

-- AlterTable: колко големи са снимките в печата (досегашните — средни).
ALTER TABLE "Scheda" ADD COLUMN "fotoDimensione" "FotoDimensione" NOT NULL DEFAULT 'MEDIE';

-- AlterTable: мястото на снимката в печата (празно — по разделите, както досега).
ALTER TABLE "Allegato" ADD COLUMN "ordineStampa" INTEGER;

-- Скицникът — включен за всяка фирма и по подразбиране за новите. Кодът вече не чете колоната; тя остава
-- вярна, ако се наложи връщане към предишна версия.
ALTER TABLE "Azienda" ALTER COLUMN "schizzi" SET DEFAULT true;
UPDATE "Azienda" SET "schizzi" = true WHERE "schizzi" = false;
