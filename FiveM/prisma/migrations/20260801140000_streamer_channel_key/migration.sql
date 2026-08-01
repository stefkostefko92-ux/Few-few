-- Ключът за уникалност става НЕЧУВСТВИТЕЛЕН към регистъра. Докато беше по
-- `channel`, свален по чл. 21 ОРЗД канал можеше да се върне с друг регистър на
-- буквите — нов ред, нов статус, отпаднало възражение.

-- AlterTable
ALTER TABLE "Streamer" ADD COLUMN     "channelKey" TEXT;

-- Попълване от съществуващите редове.
UPDATE "Streamer" SET "channelKey" = lower("channel") WHERE "channelKey" IS NULL;

-- Ако историята вече съдържа два реда за един и същи канал с различен
-- регистър, по-новият пада: заглушаващият (най-старият) запис е този, който
-- трябва да оцелее.
DELETE FROM "Streamer" a
USING "Streamer" b
WHERE a."platform" = b."platform"
  AND a."channelKey" = b."channelKey"
  AND a."createdAt" > b."createdAt";

ALTER TABLE "Streamer" ALTER COLUMN "channelKey" SET NOT NULL;

-- DropIndex
DROP INDEX "Streamer_platform_channel_key";

-- CreateIndex
CREATE UNIQUE INDEX "Streamer_platform_channelKey_key" ON "Streamer"("platform", "channelKey");
