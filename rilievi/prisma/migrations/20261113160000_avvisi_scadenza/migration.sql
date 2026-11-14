-- Известията за края на пробния месец и на плана (чл. 12.6). Само добавя.
ALTER TABLE "Azienda" ADD COLUMN "avvisoScadenzaPer" TIMESTAMP(3),
ADD COLUMN "avvisoScadenzaSoglia" INTEGER;

ALTER TABLE "Azienda" ADD CONSTRAINT "Azienda_avviso_scadenza_check" CHECK (
  "avvisoScadenzaSoglia" IS NULL OR "avvisoScadenzaSoglia" IN (0, 3, 14)
);
