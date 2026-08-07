-- v43 — нулев дрейф между `schema.prisma` и реалната база.
--
-- ЗАЩО (одит с ЖИВ Postgres, 07.08.2026): дотук `prisma migrate diff` срещу
-- прясно мигрирана база съобщаваше СЕДЕМ разлики. Повечето бяха схемата, която
-- не обявява неща, направени от миграциите (типът на `express_sessions.sid`,
-- `DEFAULT CURRENT_TIMESTAMP` на три `updatedAt` полета, `DEFAULT '{}'` на
-- `polls.options`, три индекса). Тях ги изравних в схемата.
--
-- Остана един, който Prisma не може да изрази: `servers_trialEndsAt_idx` е
-- ЧАСТИЧЕН (`WHERE "trialEndsAt" IS NOT NULL`), а езикът на схемата няма такъв
-- запис. Частичният индекс е малко по-малък, но постоянно червената проверка за
-- дрейф струва повече: в шума ѝ истинска разлика минава незабелязано. Затова
-- индексът става пълен и проверката вече може да ГЕЙТВА.
--
-- Заявките, които го ползват (`trialEndsAt > now`, `trialEndsAt <= now`), се
-- обслужват еднакво добре и от двата.
DROP INDEX IF EXISTS "servers_trialEndsAt_idx";
CREATE INDEX "servers_trialEndsAt_idx" ON "servers"("trialEndsAt");
