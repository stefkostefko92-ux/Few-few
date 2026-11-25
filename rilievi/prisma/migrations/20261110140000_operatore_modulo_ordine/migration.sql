-- Собственикът, 10 ноември 2026: „Vuoi cambiare operatore? Si/no. Vuoi compilare modulo d'ordine? Se si
-- fai scegliere modulo 2sg o altro.“ Написана на ръка върху `prisma migrate diff`; добавя, не трие.

-- CreateEnum
CREATE TYPE "OperatoreModulo" AS ENUM ('MODULO_2SG', 'ALTRO');

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN "operatoreOrdine" BOOLEAN,
ADD COLUMN "operatoreModulo" "OperatoreModulo",
ADD COLUMN "operatoreModuloAltro" VARCHAR(120);

-- Досега „Sì“ на оператора отваряше листа на 2SG направо: тези карти получават „Sì“ на модула за
-- поръчка и „2SG“ — листът им остава отворен, както е бил. `updatedAt` не се мести (отворените форми
-- не получават конфликт).
UPDATE "Scheda" SET "operatoreOrdine" = true, "operatoreModulo" = 'MODULO_2SG' WHERE "operatore" = true;
