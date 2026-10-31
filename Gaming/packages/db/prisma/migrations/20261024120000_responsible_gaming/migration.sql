-- Отговорна игра: напомняне за време в играта, дневен лимит на сесията и
-- самоизключване (24 ч / 7 дни / 30 дни / 6 месеца). Само добавяне на колони —
-- съществуващите акаунти получават „изключено“ / „без лимит“ / „няма“.
ALTER TABLE "User" ADD COLUMN "realityCheckMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "dailyLimitMinutes" INTEGER;
ALTER TABLE "User" ADD COLUMN "selfExcludedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "selfExcludedAt" TIMESTAMP(3);

-- Админският преглед и realtime проверката търсят по края на самоизключването.
CREATE INDEX "User_selfExcludedUntil_idx" ON "User"("selfExcludedUntil");
