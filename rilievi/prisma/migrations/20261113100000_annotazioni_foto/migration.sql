-- Анотациите върху снимките (C5): листът на скицника над снимката. Само добавя; null — без анотации.
ALTER TABLE "Allegato" ADD COLUMN "annotazioni" JSONB;

-- Само на снимка и само като лист (обект с масив `e`).
ALTER TABLE "Allegato" ADD CONSTRAINT "Allegato_annotazioni_check" CHECK (
  "annotazioni" IS NULL
  OR ("tipo" = 'FOTO' AND jsonb_typeof("annotazioni") = 'object' AND jsonb_typeof("annotazioni" -> 'e') = 'array')
);
