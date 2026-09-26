-- Шаблонът на печатните документи: сайт, лого и настройките на вида.
-- Само добавяне на колони, всички незадължителни — съществуващите документи
-- се печатат както досега (стойностите по подразбиране в `modello.ts`).
ALTER TABLE "dati_azienda" ADD COLUMN "sitoWeb" TEXT;
ALTER TABLE "dati_azienda" ADD COLUMN "logo" BYTEA;
ALTER TABLE "dati_azienda" ADD COLUMN "logoTipo" TEXT;
ALTER TABLE "dati_azienda" ADD COLUMN "modelloDocumenti" JSONB;
