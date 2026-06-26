-- Retire Texas Hold'em: drop any rows referencing it, then recreate the
-- GameKey enum without the HOLDEM value (Postgres can't DROP an enum value).
DELETE FROM "RatingPerGame" WHERE "game" = 'HOLDEM';
DELETE FROM "Match" WHERE "game" = 'HOLDEM';
DELETE FROM "CollusionFlag" WHERE "game" = 'HOLDEM';

ALTER TYPE "GameKey" RENAME TO "GameKey_old";
CREATE TYPE "GameKey" AS ENUM (
  'BELOTE', 'SANTASE', 'SVARA', 'WAR', 'GOFISH', 'KENT', 'CHESS', 'BACKGAMMON',
  'DRAUGHTS', 'LUDO', 'RUMMY', 'DOMINO', 'BRIDGE', 'BATTLESHIP', 'DICE', 'BINGO',
  'WORDS', 'EIGHTBALL', 'NINEBALL', 'SNOOKER', 'MAGNAT'
);
ALTER TABLE "RatingPerGame" ALTER COLUMN "game" TYPE "GameKey" USING ("game"::text::"GameKey");
ALTER TABLE "Match" ALTER COLUMN "game" TYPE "GameKey" USING ("game"::text::"GameKey");
ALTER TABLE "CollusionFlag" ALTER COLUMN "game" TYPE "GameKey" USING ("game"::text::"GameKey");
DROP TYPE "GameKey_old";
