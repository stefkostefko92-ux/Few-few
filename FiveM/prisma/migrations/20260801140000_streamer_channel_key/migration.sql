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
--
-- Сравнението е по (createdAt, id), НЕ само по createdAt. При равни времена —
-- а те са равни, когато един пробег на cron-а е създал двата реда — условието
-- `a.createdAt > b.createdAt` е невярно в двете посоки, нито един ред не пада,
-- и следващият `CREATE UNIQUE INDEX` гърми. Тогава миграцията остава наполовина
-- приложена и цялата верига се заклещва. `id` е cuid и е уникален, значи
-- наредбата е тотална и точно един ред оцелява винаги.
DELETE FROM "Streamer" a
USING "Streamer" b
WHERE a."platform" = b."platform"
  AND a."channelKey" = b."channelKey"
  AND (a."createdAt", a."id") > (b."createdAt", b."id");

ALTER TABLE "Streamer" ALTER COLUMN "channelKey" SET NOT NULL;

-- DropIndex
DROP INDEX "Streamer_platform_channel_key";

-- CreateIndex
CREATE UNIQUE INDEX "Streamer_platform_channelKey_key" ON "Streamer"("platform", "channelKey");
