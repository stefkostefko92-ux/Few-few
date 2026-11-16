-- Довереното устройство: брояч на опитите (ревюто, 16.11.2026). Добавяне — без загуба на данни.
ALTER TABLE "User" ADD COLUMN "trustedFailures" INTEGER NOT NULL DEFAULT 0;
