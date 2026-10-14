-- Round 42: LiftPilot speaks Italian only (owner's decisions of 2026-10-12 and 2026-10-14). The language stored with
-- an account, an invitation and a pending registration has had no use since then (an English or Bulgarian value was
-- already read as Italian, src/i18n/locales.ts isLocale): it is made Italian everywhere, so that no account keeps a
-- language the product neither uses nor states (GDPR art. 5(1)(c); the privacy notice of version 5 no longer lists
-- it). Data only, no change of schema; idempotent. The language of the terms' text each owner accepted stays in the
-- activity log (TERMS_ACCEPTED, meta.locale): that is the record of what was accepted, not touched here.
--
-- Rollback: the former values come back only from the backup taken before the deploy (deploy/backup.sh); nothing
-- reads them, so the migration's row alone can go:
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '19_locale_it';

UPDATE "User" SET "locale" = 'it' WHERE "locale" <> 'it';
UPDATE "Invite" SET "locale" = 'it' WHERE "locale" <> 'it';
UPDATE "PendingRegistration" SET "locale" = 'it' WHERE "locale" <> 'it';
