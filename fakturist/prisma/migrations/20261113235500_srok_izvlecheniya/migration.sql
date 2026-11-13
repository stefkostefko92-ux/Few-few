-- Срокът за данните от извлеченията (правен преглед, H1): кога редът е свързан или пропуснат. Само добавя.
-- AlterTable
ALTER TABLE "BankLine" ADD COLUMN     "decidedAt" TIMESTAMP(3);

