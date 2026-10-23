-- Rilievi synchronised with the rilievi portal up to commit 988f3cf37 (round 49; its migrations
-- centralina_telesoccorso_mastech, moduli_stampati, note_tiranti_controlli, tiranti_fossa_tipo_argano and
-- centralina_tubo_flessibile — the final state only). Written by hand over `prisma migrate diff`. Additive only: one
-- enum and 33 columns, NULL or an empty list on every existing sheet — no data is changed, so the previous code reads
-- the database after it too:
--   * Mastech's panel model ("quadroModello": NG120 or QI Touch, each with its own order module in "ordineQuadro"),
--     a reduced pit and headroom, the notes of «Quadro», «Argano» and «Serrature o sospensioni»;
--   * an argano that stays: its kind, the brake shoes, the shoe check kit and the check on the control panel (with
--     their kind); the tie rods of the car, of the counterweight and — for a hydraulic lift — in the pit; the kind of the
--     retiring cam; a note for the shaft lighting; the emergency call as three things to install;
--   * the power unit of a hydraulic lift: to replace, make and model, the A3 amendment, the flexible hose (diameter,
--     length, notes), its notes;
--   * the print choices kept with the sheet: which modules ("moduliStampati", the columns; empty with "riepilogoOrdini"
--     true is all three, as before) and which sections are left out ("sezioniEscluse", empty — every section).
-- Not taken from rilievi: the 24 columns and 7 enums of the first «Centralina» and of the brake contacts (rilievi no
-- longer asks them and keeps them for its own old answers; LiftPilot never had them — prisma/schema.prisma, Scheda), and
-- the data copy of tiranti_fossa_tipo_argano (counterweight tie rods → pit tie rods of hydraulic sheets): here both
-- sides are new and empty, so it would change nothing. The questions taken off the sheet (the door operator's make,
-- clear opening and voltage, the existing emergency call and its state) keep their columns with the old answers.
--
-- Rollback (take a backup first — pg_dump -t '"Scheda"'). Dropping the columns loses what was written in them since:
--   ALTER TABLE "Scheda" DROP COLUMN "arganoNote", DROP COLUMN "arganoTipo", DROP COLUMN "centralinaDaFare",
--     DROP COLUMN "centralinaMarca", DROP COLUMN "centralinaNote", DROP COLUMN "controlloQuadro",
--     DROP COLUMN "controlloQuadroTipo", DROP COLUMN "cornettaInstallare", DROP COLUMN "emendamentoA3",
--     DROP COLUMN "fossaRidotta", DROP COLUMN "ganasceFreno", DROP COLUMN "kitControlloGanasce",
--     DROP COLUMN "kitControlloGanasceTipo", DROP COLUMN "luceVanoNote", DROP COLUMN "moduliStampati",
--     DROP COLUMN "pattinoRetrattileTipo", DROP COLUMN "perifericaInstallare", DROP COLUMN "quadroModello",
--     DROP COLUMN "quadroNote", DROP COLUMN "serratureNote", DROP COLUMN "sezioniEscluse",
--     DROP COLUMN "telesoccorsoInstallare", DROP COLUMN "testataRidotta", DROP COLUMN "tirantiCabinaNumero",
--     DROP COLUMN "tirantiCabinaTipo", DROP COLUMN "tirantiContrappesoNumero", DROP COLUMN "tirantiContrappesoTipo",
--     DROP COLUMN "tirantiFossaNumero", DROP COLUMN "tirantiFossaTipo", DROP COLUMN "tuboFlessibile",
--     DROP COLUMN "tuboFlessibileDiametroMm", DROP COLUMN "tuboFlessibileLunghezzaM", DROP COLUMN "tuboFlessibileNote";
--   DROP TYPE "RilievoQuadroModello";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '26_rilievi_sync_2';

-- CreateEnum
CREATE TYPE "RilievoQuadroModello" AS ENUM ('NG120', 'QI_TOUCH');

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "arganoNote" TEXT,
ADD COLUMN     "arganoTipo" VARCHAR(120),
ADD COLUMN     "centralinaDaFare" BOOLEAN,
ADD COLUMN     "centralinaMarca" VARCHAR(120),
ADD COLUMN     "centralinaNote" TEXT,
ADD COLUMN     "controlloQuadro" BOOLEAN,
ADD COLUMN     "controlloQuadroTipo" VARCHAR(120),
ADD COLUMN     "cornettaInstallare" BOOLEAN,
ADD COLUMN     "emendamentoA3" BOOLEAN,
ADD COLUMN     "fossaRidotta" BOOLEAN,
ADD COLUMN     "ganasceFreno" BOOLEAN,
ADD COLUMN     "kitControlloGanasce" BOOLEAN,
ADD COLUMN     "kitControlloGanasceTipo" VARCHAR(120),
ADD COLUMN     "luceVanoNote" TEXT,
ADD COLUMN     "moduliStampati" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pattinoRetrattileTipo" VARCHAR(120),
ADD COLUMN     "perifericaInstallare" BOOLEAN,
ADD COLUMN     "quadroModello" "RilievoQuadroModello",
ADD COLUMN     "quadroNote" TEXT,
ADD COLUMN     "serratureNote" TEXT,
ADD COLUMN     "sezioniEscluse" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "telesoccorsoInstallare" BOOLEAN,
ADD COLUMN     "testataRidotta" BOOLEAN,
ADD COLUMN     "tirantiCabinaNumero" INTEGER,
ADD COLUMN     "tirantiCabinaTipo" VARCHAR(120),
ADD COLUMN     "tirantiContrappesoNumero" INTEGER,
ADD COLUMN     "tirantiContrappesoTipo" VARCHAR(120),
ADD COLUMN     "tirantiFossaNumero" INTEGER,
ADD COLUMN     "tirantiFossaTipo" VARCHAR(120),
ADD COLUMN     "tuboFlessibile" BOOLEAN,
ADD COLUMN     "tuboFlessibileDiametroMm" DECIMAL(8,2),
ADD COLUMN     "tuboFlessibileLunghezzaM" DECIMAL(8,2),
ADD COLUMN     "tuboFlessibileNote" TEXT;

