-- Реквизитите, без които FatturaPA XML-ът се отхвърля от SDI.
--
--  • `regimeFiscale` на издателя — задължителен елемент на `CedentePrestatore`.
--  • `codiceSdi` на КЛИЕНТА — не същото като `codiceSdi` на издателя. Без него
--    и без PEC документът няма къде да бъде доставен.
--  • `naturaIva` на реда — задължителна, когато ставката е 0: иначе SDI не може
--    да различи освободена доставка от забравена ставка.

ALTER TABLE "dati_azienda" ADD COLUMN "regimeFiscale" TEXT NOT NULL DEFAULT 'RF01';
ALTER TABLE "amministratori" ADD COLUMN "codiceSdi" TEXT;
ALTER TABLE "voci_fattura" ADD COLUMN "naturaIva" TEXT;
-- И на офертата: тя става фактурата, а преписването на natura на ръка при
-- всяко превръщане е точно мястото, където реквизитът се губи.
ALTER TABLE "voci_preventivo" ADD COLUMN "naturaIva" TEXT;
