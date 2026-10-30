-- Round 57: when what an installation reads of a survey sheet last changed, or the sheet was linked to it. Until now an
-- installation's records turned «da aggiornare» at any change of a linked sheet (its `updatedAt`, a note too), and a
-- sheet linked after a calculation turned nothing. Additive: a new nullable column, filled from `updatedAt` so that every
-- installation keeps the state it has.
--
-- Rollback:
--   ALTER TABLE "Scheda" DROP COLUMN "datiAt";
ALTER TABLE "Scheda" ADD COLUMN "datiAt" TIMESTAMP(3);
UPDATE "Scheda" SET "datiAt" = "updatedAt" WHERE "datiAt" IS NULL;
