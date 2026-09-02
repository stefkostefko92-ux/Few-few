-- Имената на играчите онлайн, четени от `/players.json` на самия сървър.
--
-- ЛИЧНИ ДАННИ. Полето е моментна снимка, не история: `refresh-servers.ts` го
-- презаписва цяло на всяко опресняване и го изпразва, щом сървърът падне.
-- `identifiers` (steam:/license:/discord:/ip:), които същият отговор носи,
-- НЯМАТ поле тук и това е нарочно — виж `readPlayerNames` и `/privacy`.
ALTER TABLE "Server" ADD COLUMN "playerNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- `NULL` значи „нямаме видимост“ (скрит или счупен `players.json`), а не
-- „няма никого“ — второто е празен масив при непразен `playersSeenAt`.
ALTER TABLE "Server" ADD COLUMN "playersSeenAt" TIMESTAMP(3);
