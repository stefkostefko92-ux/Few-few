-- v54 — загубилият в битка губи 1–3 % от искрите си: колко точно се пази в
-- реда на битката (одит + таванът на платените загуби на защитника).
-- Адитивна миграция — една колона с подразбиране 0.

-- AlterTable
ALTER TABLE "companion_battles" ADD COLUMN     "lostSparks" INTEGER NOT NULL DEFAULT 0;

