-- Round 44 (phase 2 of the owner's plan of 2026-10-14): a survey sheet (Rilievi) belongs to an installation. Written by
-- hand over `prisma migrate diff`; additive only:
--   * "Scheda"."projectId" — the installation the survey was made for, or NULL (not linked). Many surveys per
--     installation: its history, the newest by "data" then "createdAt" is the reference (prefill and comparison,
--     src/lib/collega/). Existing sheets stay unlinked;
--   * the foreign key ON DELETE SET NULL: an installation that goes (only with its company, which takes its sheets too)
--     never takes a survey with it;
--   * the index ("projectId", "data" DESC): an installation's surveys newest first, the reference first.
-- The link is written only by src/server/collega/service.ts within one company (the sheet's and the installation's
-- "companyId" checked in the same statement) and never changes the sheet's "updatedAt": it is not part of the sheet's
-- content, nor of its version (a form opened on the sheet is not put in conflict by a link).
--
-- Rollback (take a backup first — pg_dump -t '"Scheda"'; the links are lost, the sheets themselves are not):
--   ALTER TABLE "Scheda" DROP CONSTRAINT "Scheda_projectId_fkey";
--   DROP INDEX "Scheda_projectId_data_idx";
--   ALTER TABLE "Scheda" DROP COLUMN "projectId";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20_rilievi_impianti';
-- The code of round 44 reads the column: roll the code back together with it, never the column alone.

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "Scheda_projectId_data_idx" ON "Scheda"("projectId", "data" DESC);

-- AddForeignKey
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
