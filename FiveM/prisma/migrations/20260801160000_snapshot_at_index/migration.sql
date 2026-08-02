-- Индекс само по `at` за нощното чистене.
--
-- `ServerSnapshot_serverId_at_idx` не върши работа при `DELETE WHERE at < X`:
-- водещата колона е `serverId`. Измерено с EXPLAIN ANALYZE — Seq Scan върху
-- най-голямата таблица в схемата (~64 000 нови реда на ден при 90-дневен срок).
-- CONCURRENTLY не се ползва: Prisma пуска миграциите в транзакция.
CREATE INDEX "ServerSnapshot_at_idx" ON "ServerSnapshot"("at");
