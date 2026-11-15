-- Новините на портала (собственикът, 10 ноември 2026): кога е излязла всяка новина и докога всеки човек
-- ги е прочел. Само добавя.
CREATE TABLE "Novita" (
    "id" TEXT NOT NULL,
    "pubblicataAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Novita_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "novitaLetteAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- „Dal suo ultimo accesso“: досегашните хора — от началото на деня на последния им вход (минус една
-- милисекунда), за да видят новините от този ден нататък; без вход — от днес (по-старото не е новост).
UPDATE "User"
SET "novitaLetteAt" = date_trunc('day', "lastLoginAt") - INTERVAL '1 millisecond'
WHERE "lastLoginAt" IS NOT NULL;
