-- Собственикът, 10 ноември 2026. Написана на ръка върху `prisma migrate diff`; само разширява и добавя.
-- 1) „Matricola“ става свободен текст до 40 знака (беше само цифри, до 20) — записаното остава същото.
-- 2) При ръчни врати: „Contatti antine da sostituire?“ и „Blocca portine da installare?“ (Sì/No) — нова
--    колона, не старата `bloccaPortine` (махнатият въпрос от октомври; старите отговори остават непрочетени).

-- AlterTable
ALTER TABLE "Scheda" ALTER COLUMN "matricola" SET DATA TYPE VARCHAR(40);

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN "contattiAntine" BOOLEAN,
ADD COLUMN "bloccaPortineDaInstallare" BOOLEAN;
