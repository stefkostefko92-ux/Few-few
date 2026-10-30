-- Round 50, part B: a hand-drawn survey sketch of the shaft or of the machine room (a «schizzo di rilievo») is an
-- uploaded file of its own kind, so the forms find it and a new relazione tecnica di modifica never takes it on its own
-- (src/server/rt/workspace.ts SOLO_SU_SCELTA). Additive only: one enum value, placed before ALTRO as in schema.prisma and
-- ALLEGATO_KINDS (src/lib/rt/types.ts; rt-documenti.test.ts pins the order). The target of a sketch (vano | locale) is
-- the existing `component` column; HEIC is converted to JPEG before it is stored, so the mime CHECK stays as it is. The
-- new value is not used in this transaction (PostgreSQL refuses that until it is committed). Backup and a trial on a
-- copy first; `prisma migrate deploy` only.
--
-- Rollback (PostgreSQL cannot drop an enum value without rebuilding the type, as in 08_roles_subscription_prices; the
-- sketches must be given another kind first, or they are lost):
--   UPDATE "Attachment" SET "kind" = 'ALTRO' WHERE "kind" = 'SCHIZZO';
--   -- then rebuild "AttachmentKind" without 'SCHIZZO' (CREATE TYPE … AS ENUM, ALTER TABLE "Attachment" ALTER COLUMN
--   -- "kind" TYPE … USING "kind"::text::…, DROP TYPE, ALTER TYPE … RENAME), with the triggers of 27_relazione_modifica
--   -- disabled for the statement
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '29_schizzi';

-- AlterEnum
ALTER TYPE "AttachmentKind" ADD VALUE IF NOT EXISTS 'SCHIZZO' BEFORE 'ALTRO';
