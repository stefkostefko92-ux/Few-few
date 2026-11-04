-- Напомняне на всеки N минути и текст по избор за всяко правило. Само добавя колони (null — както досега).
ALTER TABLE "AlertRule" ADD COLUMN "repeatMinutes" INTEGER;
ALTER TABLE "AlertRule" ADD COLUMN "message" TEXT;

ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_repeat_check" CHECK ("repeatMinutes" IS NULL OR "repeatMinutes" BETWEEN 5 AND 10080);
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_message_check" CHECK ("message" IS NULL OR char_length("message") <= 500);
