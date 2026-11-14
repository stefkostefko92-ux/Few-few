-- Октомври 2026 (21-ви): разделът „Centralina“ пита само дали централата се сменя, марката и модела ѝ,
-- „Emendamento A3 da installare“ и — при него — гъвкава тръба за монтиране (диаметър, дължина,
-- бележки). Колоните на тръбата се добавят (NULL); махнатите данни за централата (задвижване, бутала,
-- налягане, масло…) остават в колоните си със старите отговори — откатът само на кода ги чете както досега.

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "tuboFlessibile" BOOLEAN,
ADD COLUMN     "tuboFlessibileDiametroMm" DECIMAL(8,2),
ADD COLUMN     "tuboFlessibileLunghezzaM" DECIMAL(8,2),
ADD COLUMN     "tuboFlessibileNote" TEXT;
