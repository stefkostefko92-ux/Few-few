-- Спиране поради опасност по D.P.R. 162/1999, чл. 15, ал. 7: поддържащият спира асансьора и уведомява собственика,
-- проверяващия и общината — денят на всяко от трите уведомявания. Асансьорчика, 15 ноември 2026. Само добавя;
-- досегашните табели са спирания за работи (`pericolo` = false, без дати).
ALTER TABLE "Cartello" ADD COLUMN     "pericolo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "avvisoProprietarioAt" DATE,
ADD COLUMN     "avvisoVerificatoreAt" DATE,
ADD COLUMN     "avvisoComuneAt" DATE;
ALTER TABLE "Cartello" ADD CONSTRAINT "Cartello_pericolo_check"
  CHECK ("pericolo" OR ("avvisoProprietarioAt" IS NULL AND "avvisoVerificatoreAt" IS NULL AND "avvisoComuneAt" IS NULL));
