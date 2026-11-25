-- Един активен абонамент на фирма (ревю на Е2-4): изтичане и активиране в един и същи момент не
-- оставят два. Prisma не описва частични индекси — индексът живее само тук (виж CLAUDE.md).
-- Ако вече има повече от един активен, остава най-новият (по-старите стават CANCELLED).
UPDATE "Subscription" AS s
SET "status" = 'CANCELLED'
WHERE s."status" = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "Subscription" AS n
    WHERE n."organizationId" = s."organizationId"
      AND n."status" = 'ACTIVE'
      AND (n."createdAt", n."id") > (s."createdAt", s."id")
  );

CREATE UNIQUE INDEX "Subscription_one_active_per_org" ON "Subscription"("organizationId") WHERE "status" = 'ACTIVE';
