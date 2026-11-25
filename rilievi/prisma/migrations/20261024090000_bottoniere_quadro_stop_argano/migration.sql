-- Октомври 2026 (24-ти, собственикът): „Quadro di manovra da sostituire?“ (контролът на челюстите в таблото
-- се пита само когато таблото остава), „Stop argano da installare?“ и разделът „Bottoniere“ — „Bottoniere da
-- sostituire?“ с бележка. Нови колони без стойност по подразбиране (NULL — неотговорено). Само добавя —
-- предишният код не ги чете; „Ganasce freno da cambiare“ не се пита, колоната му остава.

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "bottoniereNote" TEXT,
ADD COLUMN     "bottoniereSostituire" BOOLEAN,
ADD COLUMN     "quadroSostituire" BOOLEAN,
ADD COLUMN     "stopArgano" BOOLEAN;

-- Стара карта с „Controllo su quadro manovra: Sì“: контролът се слага на табло, което остава — новият въпрос
-- получава „No“, за да не се скрие отговорът (и да не се изтрие при следващия запис). „No“ на контрола не
-- казва нищо за таблото — там въпросът остава без отговор. Старият код не чете новата колона.
UPDATE "Scheda"
SET "quadroSostituire" = false
WHERE "quadroSostituire" IS NULL
  AND "controlloQuadro" = true;
