-- Октомври 2026 (17-и, втори преглед): при хидравлична уредба противотежест няма — вторите тиранти са
-- закрепените в ямата (свои колони); видът на аргано, което остава. Колоните се добавят (NULL);
-- контактите на спирачката не се питат повече — колоната им остава със старите отговори.

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "arganoTipo" VARCHAR(120),
ADD COLUMN     "tirantiFossaNumero" INTEGER,
ADD COLUMN     "tirantiFossaTipo" VARCHAR(120);

-- Хидравлична карта, записана с „тирантите на противотежестта“ (предишната версия ги питаше при всяка
-- уредба): същите стойности стават тирантите в ямата. Старите колони не се пипат — откатът само на кода
-- ги чете както досега.
UPDATE "Scheda"
SET "tirantiFossaNumero" = "tirantiContrappesoNumero",
    "tirantiFossaTipo" = "tirantiContrappesoTipo"
WHERE 'IDRAULICO' = ANY ("tipoImpianto")
  AND ("tirantiContrappesoNumero" IS NOT NULL OR "tirantiContrappesoTipo" IS NOT NULL);
