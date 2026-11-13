-- Продажбите извън портала за прага от 10 000 € (чл. 59в от Дир. 2006/112/ЕО) — по години: числото за предходната
-- календарна година и годината, за която е въведено числото за текущата. След Нова година въведеното за „тази
-- година“ само се брои като „миналата“, а текущата започва от нула (ревюто на Кодаджията, 13 ноември 2026). Само добавя.
ALTER TABLE "ConfigPagamenti" ADD COLUMN "altreVenditeUePrecCent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "altreVenditeUeAnno" INTEGER;
ALTER TABLE "ConfigPagamenti" ADD CONSTRAINT "ConfigPagamenti_altre_vendite_anno_check"
  CHECK ("altreVenditeUePrecCent" >= 0 AND ("altreVenditeUeAnno" IS NULL OR "altreVenditeUeAnno" BETWEEN 2026 AND 2200));
