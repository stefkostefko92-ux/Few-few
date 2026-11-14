-- Един адрес на сървър + правило за индексиране + истински `lastmod`.
--
-- ИЗЦЯЛО АДИТИВНА: три нови колони, един външен ключ, един индекс, попълване.
-- Нищо не се трие и нищо съществуващо не се променя по смисъл. Връщане назад:
-- `UPDATE "Server" SET "canonicalId" = NULL` връща всички стари адреси.

-- ── Псевдоним: същият сървър под друг Cfx код ──────────────────────────────
-- Cfx.re дава НОВ код при всяка нова регистрация, а откриването правеше нов
-- ред (и нов адрес) за всеки код — измерено на живо: „ODYSSEY RolePlay“ ×12,
-- „Nova RP“ ×8. Пише се от `applyIdentityPlan` при всеки пробег на
-- откриването; тук само се създава.
ALTER TABLE "Server" ADD COLUMN "canonicalId" TEXT;
ALTER TABLE "Server"
  ADD CONSTRAINT "Server_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "Server"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Server_canonicalId_idx" ON "Server"("canonicalId");

-- ── Последният момент с поне един играч ────────────────────────────────────
ALTER TABLE "Server" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- От историята: последната снимка с играчи (снимките се пазят 90 дни).
UPDATE "Server" s
SET "lastActiveAt" = a."at"
FROM (
  SELECT "serverId", MAX("at") AS "at"
  FROM "ServerSnapshot"
  WHERE "players" > 0
  GROUP BY "serverId"
) a
WHERE a."serverId" = s."id";

-- Сървър с играчи В МОМЕНТА, но без снимка („private“ при Cfx — пише се само
-- от списъка, не от пингване): последното ни виждане е моментът на активност.
UPDATE "Server"
SET "lastActiveAt" = GREATEST(
  COALESCE("lastSeenInListAt", "lastCheckedAt", "updatedAt"),
  COALESCE("lastCheckedAt", "lastSeenInListAt", "updatedAt")
)
WHERE "lastActiveAt" IS NULL AND "online" = true AND "players" > 0;

-- ── Кога се е сменило съдържанието (lastmod) ───────────────────────────────
ALTER TABLE "Server" ADD COLUMN "contentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Най-късното от: създаване, редакция от панела, одобрено ревю, отговор под
-- ревю. Всичко идва от одитния дневник, който пази кога е взето решението, а
-- не кога е подадено ревюто (`Review.createdAt` е по-ранно и би дало `lastmod`
-- преди реалната промяна — тогава търсачката няма причина да мине пак).
UPDATE "Server" s
SET "contentUpdatedAt" = GREATEST(
  s."createdAt",
  COALESCE(
    (SELECT MAX(l."at") FROM "AuditLog" l WHERE l."action" = 'server-edit' AND l."target" = s."slug"),
    s."createdAt"
  ),
  COALESCE(
    (
      SELECT MAX(l."at")
      FROM "AuditLog" l
      JOIN "Review" r ON r."id" = l."target"
      WHERE r."serverId" = s."id" AND l."action" IN ('review', 'review-reply')
    ),
    s."createdAt"
  )
);
