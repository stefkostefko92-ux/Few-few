-- Второто задание за картата: оператор и детайли на вратите, осветлението на шахтата, аварийната
-- връзка и портиерната, работната поръчка и мерките на старите бутониери по спирки.
-- Написана на ръка върху `prisma migrate diff`. Новите колони са празни (null) — старите карти не се
-- променят; „Serrature“ става „Serrature/sospensioni“ само в речника.

-- CreateEnum
CREATE TYPE "TelesoccorsoStato" AS ENUM ('COMPLETO', 'MANCA_PERIFERICA');

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "allarmePortineria" BOOLEAN,
ADD COLUMN     "autolivellamento" BOOLEAN,
ADD COLUMN     "bloccaPortine" BOOLEAN,
ADD COLUMN     "bottoniereMisure" BOOLEAN,
ADD COLUMN     "buonoLavoro" VARCHAR(60),
ADD COLUMN     "displayPortineria" BOOLEAN,
ADD COLUMN     "doppioAccesso" BOOLEAN,
ADD COLUMN     "lucePorte" VARCHAR(60),
ADD COLUMN     "luceVanoSostituire" BOOLEAN,
ADD COLUMN     "operatoreMarca" VARCHAR(120),
ADD COLUMN     "operatoreTensione" VARCHAR(60),
ADD COLUMN     "pattinoRetrattile" BOOLEAN,
ADD COLUMN     "pattinoRetrattileNumero" INTEGER,
ADD COLUMN     "telesoccorso" BOOLEAN,
ADD COLUMN     "telesoccorsoStato" "TelesoccorsoStato";

-- CreateTable
CREATE TABLE "MisuraBottoniera" (
    "id" TEXT NOT NULL,
    "schedaId" TEXT NOT NULL,
    "fermata" INTEGER NOT NULL,
    "piano" VARCHAR(20),
    "lunghezzaMm" DECIMAL(7,2),
    "larghezzaMm" DECIMAL(7,2),
    "interasseSuperiore" VARCHAR(60),
    "interasseInferiore" VARCHAR(60),
    "display" BOOLEAN,

    CONSTRAINT "MisuraBottoniera_pkey" PRIMARY KEY ("id"),
    -- Спирката е от 1 до горната граница на „Fermate“ (src/schede/fields.ts).
    CONSTRAINT "MisuraBottoniera_fermata_check" CHECK ("fermata" BETWEEN 1 AND 300)
);

-- CreateIndex (започва със schedaId — покрива и външния ключ)
CREATE UNIQUE INDEX "MisuraBottoniera_schedaId_fermata_key" ON "MisuraBottoniera"("schedaId", "fermata");

-- AddForeignKey
ALTER TABLE "MisuraBottoniera" ADD CONSTRAINT "MisuraBottoniera_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
