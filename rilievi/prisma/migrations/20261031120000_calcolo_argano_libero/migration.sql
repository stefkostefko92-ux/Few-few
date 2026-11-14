-- Изчислението за аргано и без карта (собственикът, 31 октомври 2026 — „cercare il numero di matricola o
-- la via e precompilare il calcolo se ho già la scheda impianto“): картата става по избор, фирмата е на
-- самото изчисление (досегашните я взимат от картата си), адресът, матрикулата и номерът — за изчислението
-- без карта. Само добавя: нищо не се трие, досегашните изчисления остават същите.

-- AlterTable
ALTER TABLE "CalcoloArgano" ADD COLUMN "aziendaId" TEXT,
ADD COLUMN "indirizzo" TEXT,
ADD COLUMN "matricola" TEXT,
ADD COLUMN "numeroImpianto" TEXT,
ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "schedaId" DROP NOT NULL;

-- Досегашните изчисления — фирмата на картата им (всяко има карта: колоната беше NOT NULL).
UPDATE "CalcoloArgano" AS c
SET "aziendaId" = s."aziendaId"
FROM "Scheda" AS s
WHERE s."id" = c."schedaId";

ALTER TABLE "CalcoloArgano" ALTER COLUMN "aziendaId" SET NOT NULL;

-- Без карта — поне адресът (иначе изчислението не се намира и PDF-ът няма уредба).
ALTER TABLE "CalcoloArgano" ADD CONSTRAINT "CalcoloArgano_impianto_check"
  CHECK ("schedaId" IS NOT NULL OR length(btrim(coalesce("indirizzo", ''))) > 0);

-- CreateIndex
CREATE INDEX "CalcoloArgano_aziendaId_updatedAt_idx" ON "CalcoloArgano"("aziendaId", "updatedAt");

-- AddForeignKey
ALTER TABLE "CalcoloArgano" ADD CONSTRAINT "CalcoloArgano_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
