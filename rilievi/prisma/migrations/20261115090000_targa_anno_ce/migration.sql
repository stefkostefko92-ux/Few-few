-- Табелата в кабината по D.P.R. 162/1999, чл. 16, ал. 3 а) и б): кой прави периодичните проверки, монтажникът и
-- фабричният номер. Годината на монтажа и CE маркировката — кое важи (D.M. 23/07/2009, чл. 1–2). Асансьорчика,
-- 15 ноември 2026. Само добавя; старите карти остават с празни стойности.
ALTER TABLE "Scheda" ADD COLUMN     "soggettoVerifiche" VARCHAR(120),
ADD COLUMN     "installatore" VARCHAR(120),
ADD COLUMN     "numeroFabbricazione" VARCHAR(40),
ADD COLUMN     "annoInstallazione" INTEGER,
ADD COLUMN     "marcaturaCe" BOOLEAN;
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_annoInstallazione_check"
  CHECK ("annoInstallazione" IS NULL OR "annoInstallazione" BETWEEN 1850 AND 2100);
