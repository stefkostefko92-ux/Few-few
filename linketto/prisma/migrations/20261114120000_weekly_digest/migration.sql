-- Седмичен отчет „езикова дупка“ (по имейл): отказ с 1 клик + кога cron-ът
-- е обработил потребителя последно (≤1 отчет на ~седмица; партидата се върти).
ALTER TABLE "User" ADD COLUMN "digestOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastDigestAt" TIMESTAMP(3);
