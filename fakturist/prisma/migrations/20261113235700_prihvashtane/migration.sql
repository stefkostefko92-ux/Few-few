-- Прихващане при смяна на план (решение на собственика, 13.11.2026). Само добавя.
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "creditCents" INTEGER NOT NULL DEFAULT 0;
