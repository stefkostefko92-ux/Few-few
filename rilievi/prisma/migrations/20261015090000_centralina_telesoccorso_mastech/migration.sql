-- Октомври 2026: централата на хидравличния асансьор (вместо аргано и ограничителя), разделът
-- „Telesoccorso“ (трите „da installare“), Mastech NG120 / QI Touch, намалена яма и горно пространство,
-- челюстите и контактите на спирачката, изключените от печата раздели. Само добавя: нови enum-и и
-- колони (NULL или празен масив) — откатът само на кода чете базата и след нея; старите колони
-- „telesoccorso“ и „telesoccorsoStato“ остават със старите отговори.

-- CreateEnum
CREATE TYPE "QuadroModello" AS ENUM ('NG120', 'QI_TOUCH');

-- CreateEnum
CREATE TYPE "CentralinaAzionamento" AS ENUM ('DIRETTO_LATERALE', 'DIRETTO_CENTRALE', 'INDIRETTO_2_1');

-- CreateEnum
CREATE TYPE "CentralinaAlimentazione" AS ENUM ('TRIFASE_400', 'MONOFASE_230', 'ALTRO');

-- CreateEnum
CREATE TYPE "CentralinaAvviamento" AS ENUM ('DIRETTO', 'STELLA_TRIANGOLO', 'SOFT_STARTER', 'INVERTER');

-- CreateEnum
CREATE TYPE "Tubazione" AS ENUM ('RIGIDA', 'FLESSIBILE');

-- CreateEnum
CREATE TYPE "CentralinaMotore" AS ENUM ('IMMERSO', 'ESTERNO');

-- CreateEnum
CREATE TYPE "OlioLivello" AS ENUM ('REGOLARE', 'BASSO');

-- CreateEnum
CREATE TYPE "OlioStato" AS ENUM ('BUONO', 'DA_SOSTITUIRE', 'PERDITE');

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "centralinaAccesso" VARCHAR(200),
ADD COLUMN     "centralinaAlimentazione" "CentralinaAlimentazione",
ADD COLUMN     "centralinaAlimentazioneAltro" VARCHAR(60),
ADD COLUMN     "centralinaAttacco" VARCHAR(60),
ADD COLUMN     "centralinaAvviamento" "CentralinaAvviamento",
ADD COLUMN     "centralinaAzionamento" "CentralinaAzionamento",
ADD COLUMN     "centralinaBloccoValvole" VARCHAR(120),
ADD COLUMN     "centralinaCorsaM" DECIMAL(8,2),
ADD COLUMN     "centralinaCorseOra" INTEGER,
ADD COLUMN     "centralinaDaFare" BOOLEAN,
ADD COLUMN     "centralinaDiametroPistoneMm" DECIMAL(8,2),
ADD COLUMN     "centralinaDiscesaEmergenza" BOOLEAN,
ADD COLUMN     "centralinaDistanzaM" DECIMAL(8,2),
ADD COLUMN     "centralinaMarca" VARCHAR(120),
ADD COLUMN     "centralinaMotore" "CentralinaMotore",
ADD COLUMN     "centralinaNote" TEXT,
ADD COLUMN     "centralinaOlioLivello" "OlioLivello",
ADD COLUMN     "centralinaOlioStato" "OlioStato",
ADD COLUMN     "centralinaParacadute" BOOLEAN,
ADD COLUMN     "centralinaPistoni" INTEGER,
ADD COLUMN     "centralinaPortataPompa" DECIMAL(8,2),
ADD COLUMN     "centralinaPotenzaKw" DECIMAL(8,2),
ADD COLUMN     "centralinaPressioneBar" DECIMAL(8,2),
ADD COLUMN     "centralinaTubazione" "Tubazione",
ADD COLUMN     "centralinaTubazioneM" DECIMAL(8,2),
ADD COLUMN     "centralinaVelocita" DECIMAL(8,2),
ADD COLUMN     "contattiFreno" BOOLEAN,
ADD COLUMN     "cornettaInstallare" BOOLEAN,
ADD COLUMN     "emendamentoA3" BOOLEAN,
ADD COLUMN     "fossaRidotta" BOOLEAN,
ADD COLUMN     "ganasceFreno" BOOLEAN,
ADD COLUMN     "perifericaInstallare" BOOLEAN,
ADD COLUMN     "quadroModello" "QuadroModello",
ADD COLUMN     "sezioniEscluse" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "telesoccorsoInstallare" BOOLEAN,
ADD COLUMN     "testataRidotta" BOOLEAN;

