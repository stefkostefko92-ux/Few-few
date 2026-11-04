-- Осмото задание: „Ubicazione cassettina“ става свободен текст (досега цяло число — етажът) и картата
-- пази дали печатът и PDF-ът ѝ включват попълненото в модулите на таблото и аргано.
-- Написана на ръка върху `prisma migrate diff`. Нищо не се губи: числото става същият текст („-1“),
-- а новата колона е false за старите карти — печатът им остава какъвто беше.

-- AlterTable
ALTER TABLE "Scheda"
  ALTER COLUMN "ubicazioneCassettina" SET DATA TYPE VARCHAR(120) USING "ubicazioneCassettina"::text;

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN "riepilogoOrdini" BOOLEAN NOT NULL DEFAULT false;
