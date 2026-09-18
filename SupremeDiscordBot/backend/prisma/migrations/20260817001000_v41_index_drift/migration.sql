-- v41 — индекси: изравняване на схема ↔ миграции + липсващи горещи пътища.
--
-- ЗАЩО ИЗОБЩО СЪЩЕСТВУВА
-- Три индекса живееха САМО в SQL миграция, без `@@index` в `schema.prisma`:
-- `tickets(channelId)`, `audit_logs(createdAt)`, `servers(trialEndsAt)`. Prisma
-- смята схемата за източник на истината — първият `prisma migrate dev` щеше да
-- ги обяви за дрейф и да ги ИЗТРИЕ. Тоест най-горещият път на бота (търсене на
-- тикет по канал при всяко съобщение) щеше да стане пълно сканиране, тихо, при
-- напълно рутинна миграция. Сега са декларирани в схемата; тук ги пресъздаваме
-- идемпотентно, за да съвпаднат двете страни.
--
-- ПЛЮС липсващи индекси, открити при одита:
--   • `polls` нямаше НИТО ЕДИН индекс — и списъкът в дашборда, и планировчикът
--     за падежирали анкети сканираха цялата таблица;
--   • `tickets(serverId, createdAt)` — списъци и CSV експортът подреждат по
--     дата (курсорът в export.js стъпва точно на нея).
--
-- CONCURRENTLY нарочно НЕ се ползва: Prisma пуска миграциите в транзакция, а
-- `CREATE INDEX CONCURRENTLY` не може да е в транзакция. Таблиците тук са малки
-- спрямо праг, при който кратката ключалка би била проблем.

-- ─── Изравняване (индексите вече съществуват в продукция; IF NOT EXISTS ги пази)
CREATE INDEX IF NOT EXISTS "tickets_channelId_idx" ON "tickets"("channelId");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "servers_trialEndsAt_idx" ON "servers"("trialEndsAt");

-- ─── Нови ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "tickets_serverId_createdAt_idx" ON "tickets"("serverId", "createdAt");
CREATE INDEX IF NOT EXISTS "polls_serverId_idx" ON "polls"("serverId");
CREATE INDEX IF NOT EXISTS "polls_closesAt_closedAt_idx" ON "polls"("closesAt", "closedAt");
