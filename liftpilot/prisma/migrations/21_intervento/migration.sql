-- Round 45 (phase 3 of the owner's plan): the intervention becomes a fact of the step-2 calculation («Calcolo argano»)
-- and a drawing of the Progetto names the calculation it was drawn on. Written by hand over `prisma migrate diff`;
-- additive only:
--   * enum "TipoIntervento" ('SOLO_ARGANO', 'AMMODERNAMENTO', 'TRASFORMAZIONE_COMPLETA') — the same names as
--     src/lib/lift/intervento.ts TIPI_INTERVENTO, no mapping between the two;
--   * "Calculation"."intervento" — the type declared with the calculation. Like "collaudo", outside the snapshot and
--     its hash (what the documents declare, not the physics); NULL = saved before round 45, read by its shape
--     (interventoDi). Written only on INSERT by src/server/save.ts: the trigger "Calculation_no_update" keeps it as
--     immutable as the rest of the row;
--   * "LiftDesign"."baseCalculationId" — the «Calcolo argano» a design was drawn on, with its index and a foreign key
--     ON DELETE NO ACTION (a calculation is never deleted alone); provenance, outside "LiftDesign"."sha256"; NULL = a
--     design of the one form before round 45 (or made again from one).
-- Nullable columns without a default rewrite no row; ADD COLUMN and ADD CONSTRAINT fire no row trigger, so
-- "Calculation_no_update" and "LiftDesign_no_update" stay as they are (the userId exception of
-- "calculation_immutable" still holds: the new column is on both NEW and OLD). No back-fill, no UPDATE.
--
-- Rollback (take a backup first — pg_dump -t '"Calculation"' -t '"LiftDesign"'; the declared types and the drawings'
-- bases are lost, the records are not):
--   ALTER TABLE "LiftDesign" DROP CONSTRAINT "LiftDesign_baseCalculationId_fkey";
--   DROP INDEX "LiftDesign_baseCalculationId_idx";
--   ALTER TABLE "LiftDesign" DROP COLUMN "baseCalculationId";
--   ALTER TABLE "Calculation" DROP COLUMN "intervento";
--   DROP TYPE "TipoIntervento";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '21_intervento';
-- The code of round 45 reads both columns: roll the code back together with them (after the rollback of a later
-- migration that drops "Project"."kind", if that one was applied), never the columns alone.

-- CreateEnum
CREATE TYPE "TipoIntervento" AS ENUM ('SOLO_ARGANO', 'AMMODERNAMENTO', 'TRASFORMAZIONE_COMPLETA');

-- AlterTable
ALTER TABLE "Calculation" ADD COLUMN "intervento" "TipoIntervento";

-- AlterTable
ALTER TABLE "LiftDesign" ADD COLUMN "baseCalculationId" TEXT;

-- CreateIndex
CREATE INDEX "LiftDesign_baseCalculationId_idx" ON "LiftDesign"("baseCalculationId");

-- AddForeignKey
ALTER TABLE "LiftDesign" ADD CONSTRAINT "LiftDesign_baseCalculationId_fkey" FOREIGN KEY ("baseCalculationId") REFERENCES "Calculation"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
