-- Времената за отзив при спешна намеса.
--
-- Началото е СИГНАЛЪТ, не `createdAt`: записът в системата се прави след
-- обаждането, понякога часове по-късно, а клиентът чака от обаждането.
--
-- Праговете стоят на ДОГОВОРА и са незадължителни: `NULL` значи „не е
-- договорено", тоест не се мери — а не мълчаливо задължение, каквото фирмата
-- не е поела. UNI EN 81-28 е платен стандарт и числата му НЕ са тук.

-- AlterTable
ALTER TABLE "contratti" ADD COLUMN     "slaInterventoMin" INTEGER,
ADD COLUMN     "slaRipristinoOre" INTEGER;

-- AlterTable
ALTER TABLE "ordini_lavoro" ADD COLUMN     "arrivoAt" TIMESTAMP(3),
ADD COLUMN     "ripristinoAt" TIMESTAMP(3),
ADD COLUMN     "segnalatoAt" TIMESTAMP(3);

