-- Съставни индекси, подравнени с ИЗМЕРЕНИТЕ заявки.
--
-- Мерено с `npm run misura:scala` върху 50 000 фактури и 3 000 импианта — обем,
-- който средна фирма достига към третата година. ШЕСТ от седем основни заявки
-- правеха ПОСЛЕДОВАТЕЛНО СКАНИРАНЕ:
--
--   fatture · списък по фирма            43,9 ms   ← първият екран на счетоводството
--   fatture · неплатени по падеж         43,7 ms
--   fatture · филтър по статус в SDI     25,5 ms
--   fatture · брой за страницирането     18,2 ms   ← при ВСЯКО отваряне
--   impianti · списък                     2,1 ms
--   scadenze · какво изтича               1,1 ms   ← и автоматизмът всяка нощ
--
-- Причината не е липсващ индекс, а ГРЕШЕН: `@@index([tenantId])` сам намира
-- редовете, но не носи подредбата. Планировчикът вижда, че трябва да извади
-- 40 000 реда и да ги сортира, и предпочита да сканира. С реда на подредбата в
-- самия индекс базата минава по него и спира след петдесетия ред.
--
-- Едноколонните се МАХАТ, а не остават „за всеки случай": съставният ги покрива
-- като ляв префикс, а всеки излишен индекс се плаща при всеки запис.
--
-- ЗАКЛЮЧВАНЕ. `CREATE INDEX` без `CONCURRENTLY` спира писането по таблицата за
-- времето на строежа. Измерено на 50 000 реда: под 100 ms общо за всички.
-- Prisma пуска миграцията в транзакция, а `CONCURRENTLY` не може вътре в такава
-- — при инсталация с милиони редове индексите се строят ръчно с
-- `CREATE INDEX CONCURRENTLY` ПРЕДИ разгръщането, а тази миграция минава
-- празна (`IF NOT EXISTS`).

-- DropIndex
DROP INDEX IF EXISTS "fatture_statoSdi_idx";

-- DropIndex
DROP INDEX IF EXISTS "fatture_tenantId_idx";

-- DropIndex
DROP INDEX IF EXISTS "impianti_tenantId_idx";

-- DropIndex
DROP INDEX IF EXISTS "scadenze_impianti_tenantId_idx";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fatture_tenantId_data_idx" ON "fatture"("tenantId", "data" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fatture_tenantId_statoSdi_data_idx" ON "fatture"("tenantId", "statoSdi", "data" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fatture_tenantId_statoPagamento_dataScadenza_idx" ON "fatture"("tenantId", "statoPagamento", "dataScadenza");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "impianti_tenantId_matricola_idx" ON "impianti"("tenantId", "matricola");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scadenze_impianti_tenantId_completata_dataScadenza_idx" ON "scadenze_impianti"("tenantId", "completata", "dataScadenza");

