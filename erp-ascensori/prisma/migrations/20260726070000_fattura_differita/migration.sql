-- Отложено фактуриране (TD24).
--
-- Един DDT се фактурира НАЙ-МНОГО веднъж; една фактура покрива много DDT. От
-- тази връзка се извежда и типът на документа за SDI — наличието на
-- съпровождащи документи ПРАВИ фактурата отложена по чл. 21, ал. 4, б. „а"
-- D.P.R. 633/1972. Отделно поле „differita" би било втора истина, която някой
-- ден ще се разминава с тази.

-- AlterTable
ALTER TABLE "ddt" ADD COLUMN     "fatturaId" UUID;

-- CreateIndex
CREATE INDEX "ddt_fatturaId_idx" ON "ddt"("fatturaId");

-- AddForeignKey
ALTER TABLE "ddt" ADD CONSTRAINT "ddt_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "fatture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

