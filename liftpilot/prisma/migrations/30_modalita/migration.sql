-- Round 52: the interface's mode of each user. «Semplice» (the default, also for the accounts that exist) shows the
-- fields most jobs need and keeps the others at the software's values; «Esperto» shows every field. Chosen in the top
-- bar and kept with the user (never in the browser). Additive only: one enum type and one column with its default; no
-- trigger of the immutable records is touched. Backup and a trial on a copy first; `prisma migrate deploy` only.
--
-- Rollback (the users' choice is lost; nothing else depends on it):
--   ALTER TABLE "User" DROP COLUMN "modalita";
--   DROP TYPE "Modalita";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '30_modalita';

-- CreateEnum
CREATE TYPE "Modalita" AS ENUM ('SEMPLICE', 'ESPERTO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "modalita" "Modalita" NOT NULL DEFAULT 'SEMPLICE';
