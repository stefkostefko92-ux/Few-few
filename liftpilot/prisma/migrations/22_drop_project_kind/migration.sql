-- Round 47 (the owner's confirmation, decision D3): "Project"."kind" — the module of an installation before round 45
-- (REPLACEMENT / FULL) — is dropped with its index and its enum. No code reads it since round 45 (the type of
-- intervention is each step-2 calculation's, "Calculation"."intervento"); the release before this one does not even
-- write it (schema.prisma `@ignore`: the global omit of rounds 45–46 still wrote the default on every INSERT — a client
-- of those rounds cannot create an installation once the column is gone). The company export never carried it (format 9,
-- unchanged). Its own release, after the engine release of rounds 46–47 is live and healthy (DEPLOY.md).
-- Lock: DROP COLUMN is a catalog change (no table rewrite), ACCESS EXCLUSIVE on "Project" for an instant; the app is
-- down while the container's entrypoint migrates. No trigger or other object uses the column or the type (pg_depend:
-- the column and its index only).
--
-- Rollback:
--   * back to the engine release (the @ignore client): the code alone is enough — it names the column nowhere;
--   * further back (a client of rounds 45–46, or older): first restore the column, then the code —
--       CREATE TYPE "ProjectKind" AS ENUM ('REPLACEMENT', 'FULL');
--       ALTER TABLE "Project" ADD COLUMN "kind" "ProjectKind" NOT NULL DEFAULT 'FULL';
--       -- the ids: first /opt/few-few/shared/liftpilot/backups/pre-22-replacement-ids.txt, saved before the migration
--       -- (DEPLOY.md, step 3) — the lasting copy; else the pre-deploy-<TS>.sql.gz deploy/deploy.sh took before it,
--       -- restored into a scratch database (deploy.sh keeps only its last 5 dumps: gone after five more deploys; and
--       -- the nightly liftpilot-backup, deploy/backup.sh, deletes every .sql.gz after 30 days — BACKUP_DAYS —, so
--       -- at most about 30 days even without a deploy; the ids file, not a .sql.gz, stays):
--       --   SELECT "id" FROM "Project" WHERE "kind" = 'REPLACEMENT';
--       UPDATE "Project" SET "kind" = 'REPLACEMENT' WHERE "id" IN (<those ids>);
--       CREATE INDEX "Project_companyId_kind_idx" ON "Project"("companyId", "kind");
--       DELETE FROM "_prisma_migrations" WHERE "migration_name" = '22_drop_project_kind';
--     (an installation created after this migration takes FULL, as the column's default always gave it.)

-- DropIndex
DROP INDEX "Project_companyId_kind_idx";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "kind";

-- DropEnum
DROP TYPE "ProjectKind";
