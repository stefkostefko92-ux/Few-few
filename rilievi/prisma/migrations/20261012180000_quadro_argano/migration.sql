-- Третото задание: таблото и аргано за поръчка. Марката (Pelazza, Movilift, DMG, Mastech, Altro /
-- Montanari, Altro), въпросът дали се попълва модулът на доставчика и самият модул като JSON
-- ({modulo, valori} — ключовете са в assets/moduli/*.json). Модулите имат свои PDF-и, отделно от картата.
-- Написана на ръка върху `prisma migrate diff`; новите колони са празни — старите карти не се променят.

-- CreateEnum
CREATE TYPE "QuadroMarca" AS ENUM ('PELAZZA', 'MOVILIFT', 'DMG', 'MASTECH', 'ALTRO');

-- CreateEnum
CREATE TYPE "ArganoMarca" AS ENUM ('MONTANARI', 'ALTRO');

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "arganoMarca" "ArganoMarca",
ADD COLUMN     "arganoMarcaAltro" VARCHAR(120),
ADD COLUMN     "arganoPreventivo" BOOLEAN,
ADD COLUMN     "ordineQuadro" JSONB,
ADD COLUMN     "preventivoArgano" JSONB,
ADD COLUMN     "quadroMarca" "QuadroMarca",
ADD COLUMN     "quadroMarcaAltro" VARCHAR(120),
ADD COLUMN     "quadroOrdine" BOOLEAN;

-- Модулът е обект {modulo, valori} или нищо — никога число, низ или масив.
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_ordineQuadro_check"
  CHECK ("ordineQuadro" IS NULL OR jsonb_typeof("ordineQuadro") = 'object');
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_preventivoArgano_check"
  CHECK ("preventivoArgano" IS NULL OR jsonb_typeof("preventivoArgano") = 'object');
