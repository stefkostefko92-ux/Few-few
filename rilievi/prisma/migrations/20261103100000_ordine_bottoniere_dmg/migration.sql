-- DMG (собственикът, 2 ноември 2026): „Vuoi compilare la scheda ordine bottoniere DMG?“ в раздела
-- „Bottoniere“ и модулът QF Fixtures. Таблото DMG (Pitagora 4.0) е в досегашната колона „ordineQuadro“.
-- Само добавя — нищо от досегашното не се пипа.

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "bottoniereOrdine" BOOLEAN,
ADD COLUMN     "ordineBottoniere" JSONB;
