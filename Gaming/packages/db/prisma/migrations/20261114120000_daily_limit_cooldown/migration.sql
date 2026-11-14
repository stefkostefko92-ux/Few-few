-- Отговорна игра: дневният лимит се налага от сървъра. Вдигане или махане на
-- лимита чака 24 ч (свалянето важи веднага), за да не се вдига точно когато е
-- достигнат. Само добавяне на колони — няма чакащи промени за съществуващите.
ALTER TABLE "User" ADD COLUMN "dailyLimitPendingMinutes" INTEGER;
ALTER TABLE "User" ADD COLUMN "dailyLimitPendingAt" TIMESTAMP(3);
