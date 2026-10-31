-- Октомври 2026: бележки в разделите „Quadro“, „Argano“ и „Serrature o sospensioni“, комплектът за
-- контрол на челюстите и контролът в таблото на управление (при аргано, което остава), тирантите на
-- кабината и на противотежестта, видът на прибиращата се шейна, бележка за осветлението на шахтата.
-- Само добавя колони (NULL) — откатът само на кода чете базата и след нея. Марката, светлият отвор и
-- напрежението на оператора на вратите не се питат повече: колоните им остават със старите отговори.

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "arganoNote" TEXT,
ADD COLUMN     "controlloQuadro" BOOLEAN,
ADD COLUMN     "controlloQuadroTipo" VARCHAR(120),
ADD COLUMN     "kitControlloGanasce" BOOLEAN,
ADD COLUMN     "kitControlloGanasceTipo" VARCHAR(120),
ADD COLUMN     "luceVanoNote" TEXT,
ADD COLUMN     "pattinoRetrattileTipo" VARCHAR(120),
ADD COLUMN     "quadroNote" TEXT,
ADD COLUMN     "serratureNote" TEXT,
ADD COLUMN     "tirantiCabinaNumero" INTEGER,
ADD COLUMN     "tirantiCabinaTipo" VARCHAR(120),
ADD COLUMN     "tirantiContrappesoNumero" INTEGER,
ADD COLUMN     "tirantiContrappesoTipo" VARCHAR(120);

