-- Собственикът, 3 ноември 2026 (снимките на листовете): „Note locale macchina“; „Quantità funi DX/SX“;
-- решенията при намалено горно пространство и яма (AMI 100 Mono RTBS — отметка в тях, без въпроса
-- „Installare AMI 100?“ и без Mono UCM); централата — данните при смяна и кит A3 за тази, която остава.
-- Добавя колони и enum-и; старите колони (`ami100`, `ami100Tipo`, `ordineAmi`) остават с отговорите си.

-- CreateEnum
CREATE TYPE "TestataIntervento" AS ENUM ('PUNTONI_WW', 'AMI100_RTBS', 'SEMAFORO', 'PUNTONE_OKATT');

-- CreateEnum
CREATE TYPE "FossaIntervento" AS ENUM ('AMI100_RTBS', 'SEMAFORO', 'GREMBIULE_3_STADI', 'PUNTONE_OKATT');

-- CreateEnum
CREATE TYPE "TipoPistone" AS ENUM ('IN_TAGLIA', 'DIRETTO');

-- CreateEnum
CREATE TYPE "CentralinaInOpera" AS ENUM ('HYDRONIC', 'ALTRO');

-- CreateEnum
CREATE TYPE "KitA3Hydronic" AS ENUM ('HSV_150_440_BIS', 'PRESSOSTATO', 'CONNETTORE');

-- CreateEnum
CREATE TYPE "KitA3Valvola" AS ENUM ('HSV_150_BIS', 'HSV_440_BIS');

-- CreateEnum
CREATE TYPE "KitA3Componente" AS ENUM ('BOBINA_48_12', 'SARACINESCA', 'RACCORDO_MISTO', 'PRESSOSTATO');

-- CreateEnum
CREATE TYPE "Saracinesca" AS ENUM ('ASS_2', 'ASS_3');

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "centralinaAvvio" "CentralinaAvviamento",
ADD COLUMN     "centralinaCorsaImpianto" DECIMAL(8,2),
ADD COLUMN     "centralinaDiametroStelo" DECIMAL(8,2),
ADD COLUMN     "centralinaDiametroTubazione" VARCHAR(40),
ADD COLUMN     "centralinaInOpera" "CentralinaInOpera",
ADD COLUMN     "centralinaLitriOlio" DECIMAL(10,2),
ADD COLUMN     "centralinaMarcaPistone" VARCHAR(120),
ADD COLUMN     "centralinaMotoreHp" DECIMAL(8,2),
ADD COLUMN     "centralinaMotoreV" INTEGER,
ADD COLUMN     "centralinaNoteRaccordi" TEXT,
ADD COLUMN     "centralinaPompaLMin" DECIMAL(8,2),
ADD COLUMN     "centralinaTensioneValvole" VARCHAR(40),
ADD COLUMN     "centralinaTipoPistone" "TipoPistone",
ADD COLUMN     "fossaInterventi" "FossaIntervento"[],
ADD COLUMN     "funiDx" INTEGER,
ADD COLUMN     "funiSx" INTEGER,
ADD COLUMN     "grembiuleNote" VARCHAR(300),
ADD COLUMN     "kitA3Altro" "KitA3Componente"[],
ADD COLUMN     "kitA3Hydronic" "KitA3Hydronic"[],
ADD COLUMN     "kitA3Saracinesca" "Saracinesca",
ADD COLUMN     "kitA3TensioneBobine" VARCHAR(40),
ADD COLUMN     "kitA3Valvola" "KitA3Valvola",
ADD COLUMN     "noteLocaleMacchina" TEXT,
ADD COLUMN     "testataInterventi" "TestataIntervento"[];


-- Картите с AMI 100 Mono RTBS досега: отметката в списъка на това, което е било намалено — листът им
-- (`ordineAmi`) остава отворен. Mono UCM няма отметка: записаното остава в колоната, без да се чете.
UPDATE "Scheda" SET "testataInterventi" = ARRAY['AMI100_RTBS']::"TestataIntervento"[]
WHERE "ami100" = true AND "ami100Tipo" = 'MONO_RTBS' AND "testataRidotta" = true;

UPDATE "Scheda" SET "fossaInterventi" = ARRAY['AMI100_RTBS']::"FossaIntervento"[]
WHERE "ami100" = true AND "ami100Tipo" = 'MONO_RTBS' AND "fossaRidotta" = true;
