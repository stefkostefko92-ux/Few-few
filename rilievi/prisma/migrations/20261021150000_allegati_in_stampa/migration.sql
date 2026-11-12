-- Октомври 2026 (21-ви): снимките за печата и PDF-а се избират поотделно — иконките в края на формата.
-- Нова колона на снимката (по подразбиране не). Картите с досегашната отметка „Includi le foto“ запазват
-- печата си: всичките им снимки се отбелязват. `Scheda.fotoStampate` остава — предишният код я чете, а
-- новият я поддържа като „поне една снимка в печата“. Само добавя и попълва.

-- AlterTable
ALTER TABLE "Allegato" ADD COLUMN     "inStampa" BOOLEAN NOT NULL DEFAULT false;

-- Досегашният избор: само снимките (клиповете не се печатат) на картите с отметката.
UPDATE "Allegato" AS a
SET "inStampa" = true
FROM "Scheda" AS s
WHERE a."schedaId" = s."id" AND s."fotoStampate" = true AND a."tipo" = 'FOTO';
