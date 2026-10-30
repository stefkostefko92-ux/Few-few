-- Rilievi synchronised with the rilievi portal up to commit ae6329cb6 (its migrations cassettina_riepilogo,
-- discrepanze_confermate and sezioni_sospensioni; its aziende_multiple is rilievi's own accounts and is not taken).
-- Written by hand over `prisma migrate diff`. Additive but for one column type, done the way rilievi did it:
--   * "ubicazioneCassettina" becomes free text (until now a whole number, the floor): every stored number becomes the
--     same text ("-1"), nothing is lost and every old sheet stays readable;
--   * the sheet keeps whether its print and PDF carry what is filled in the modules ("riepilogoOrdini", false for the old
--     sheets — their print stays what it was) and the fingerprint of the discrepancies sheet ↔ modules confirmed at its
--     last save ("discrepanzeConfermate", empty for the old sheets);
--   * the locks and the suspensions to change are apart: the suspensions with their number and 2SG's sheet (a JSON
--     object {modulo, valori} or a real NULL, as the other modules);
--   * the order of the sheet's sections per company ("Company"."ordineSezioni", empty — the default order).
-- The fields the owner took off the sheet (the door blocking, the self-levelling, the number of retiring cams, the
-- argano's make) keep their columns with the old answers; «Gearless» becomes «MRL» as a label only (GEARLESS stays).
--
-- Rollback (take a backup first — pg_dump -t '"Scheda"' -t '"Company"'). The code before this migration reads
-- "ubicazioneCassettina" as a whole number: roll the code back together with the column, never the code alone.
--   ALTER TABLE "Scheda" ALTER COLUMN "ubicazioneCassettina" SET DATA TYPE INTEGER
--     USING CASE WHEN "ubicazioneCassettina" ~ '^-?[0-9]{1,3}$' THEN "ubicazioneCassettina"::integer END;  -- free text is lost
--   ALTER TABLE "Scheda" DROP CONSTRAINT "Scheda_ordineSospensioni_check";
--   ALTER TABLE "Scheda" DROP COLUMN "riepilogoOrdini", DROP COLUMN "discrepanzeConfermate", DROP COLUMN "sospensioni",
--     DROP COLUMN "sospensioniNumero", DROP COLUMN "ordineSospensioni";
--   ALTER TABLE "Company" DROP COLUMN "ordineSezioni";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '18_rilievi_sync';

-- AlterTable
ALTER TABLE "Scheda"
  ALTER COLUMN "ubicazioneCassettina" SET DATA TYPE VARCHAR(120) USING "ubicazioneCassettina"::text;

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN "riepilogoOrdini" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN "discrepanzeConfermate" VARCHAR(32);

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "sospensioni" BOOLEAN,
ADD COLUMN     "sospensioniNumero" INTEGER,
ADD COLUMN     "ordineSospensioni" JSONB;

-- The module is an object {modulo, valori} or nothing — never a number, a string or an array.
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_ordineSospensioni_check"
  CHECK ("ordineSospensioni" IS NULL OR jsonb_typeof("ordineSospensioni") = 'object');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "ordineSezioni" TEXT[] DEFAULT ARRAY[]::TEXT[];
