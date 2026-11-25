-- AMI 100 при намалена яма или горно пространство (собственикът, 30 октомври 2026): въпросът, видът
-- (Mono UCM или Mono RTBS) и листът с данните за поръчката. Само добавя — нищо от досегашното не се пипа.

-- CreateEnum
CREATE TYPE "Ami100Tipo" AS ENUM ('MONO_UCM', 'MONO_RTBS');

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "ami100" BOOLEAN,
ADD COLUMN     "ami100Tipo" "Ami100Tipo",
ADD COLUMN     "ordineAmi" JSONB;
