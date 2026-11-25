-- Refund „в ход“ без отговор от Revolut (таймаут/5XX/409): cron-ът известява
-- админите веднъж за опит. Само добавяне.

-- AlterTable
ALTER TABLE "PlanOrder" ADD COLUMN     "refundStuckAlertedAt" TIMESTAMP(3);
