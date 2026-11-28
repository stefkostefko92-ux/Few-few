-- Информацията по чл. 13 и 14 GDPR в края на офертата, както фирмата я е написала; празно — моделът
-- с данните ѝ (src/legale/informativa.ts). Само добавя.
ALTER TABLE "Azienda" ADD COLUMN "informativaPreventivi" VARCHAR(4000);
