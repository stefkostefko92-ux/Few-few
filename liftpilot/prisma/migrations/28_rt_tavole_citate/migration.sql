-- Round 49, fix step: the drawing sets an issued relazione tecnica di modifica cites, kept by identity. The report kept
-- none of them and its reproduction read them by time (issued on the base up to the report's issue): a set issued on
-- the same base while the report was being issued could be missing at the issue and present at the reproduction, and
-- the report would no longer hash to its SHA-256. Now the issue keeps their ids (src/server/rt/compose.ts setsCitati)
-- and the reproduction reads exactly those (setsPerId). Additive only: one NULL column, a JSON array of ids (CHECK) —
-- NULL on the reports issued before it (development databases only: no report was issued in production before this
-- migration), which are read by time as then. The immutability trigger of 27_relazione_modifica covers the column
-- (it compares the whole row). Needs 27_relazione_modifica before it; the same release. Backup and a trial on a copy
-- first; `prisma migrate deploy` only.
--
-- Rollback (the reports issued after it would be read by time again):
--   ALTER TABLE "TechnicalReport" DROP CONSTRAINT "TechnicalReport_citedSetIds_check";
--   ALTER TABLE "TechnicalReport" DROP COLUMN "citedSetIds";

ALTER TABLE "TechnicalReport" ADD COLUMN "citedSetIds" JSONB;
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_citedSetIds_check" CHECK ("citedSetIds" IS NULL OR jsonb_typeof("citedSetIds") = 'array');
