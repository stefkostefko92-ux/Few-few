-- cs2dm: картата на мача (CONTRACT.md §13). Само добавяне — нищо съществуващо не се променя.
-- Пише ги C# плъгинът в края на всеки мач; срок 90 дни (§7, работникът трие matches → каскада).

-- CreateTable
CREATE TABLE "matches" (
    "id" SERIAL NOT NULL,
    "map" VARCHAR(64) NOT NULL,
    "mode" VARCHAR(32) NOT NULL,
    "season_id" INTEGER NOT NULL,
    "event_id" INTEGER,
    "xp_multiplier" DECIMAL(2,1) NOT NULL DEFAULT 1.0,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3) NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "players" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_players" (
    "match_id" INTEGER NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "place" INTEGER NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "headshots" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "bounties_claimed" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "top_weapon" VARCHAR(32),
    "top_weapon_kills" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("match_id","steam_id")
);

-- CreateIndex
CREATE INDEX "matches_ended_at_idx" ON "matches"("ended_at");

-- CreateIndex
CREATE INDEX "match_players_steam_id_idx" ON "match_players"("steam_id");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===== cs2dm: ръчни допълнения към генерираната миграция =====
ALTER TABLE "matches" ADD CONSTRAINT "matches_time_check" CHECK ("ended_at" >= "started_at");
ALTER TABLE "matches" ADD CONSTRAINT "matches_xp_multiplier_check"
  CHECK ("xp_multiplier" >= 1.0 AND "xp_multiplier" <= 3.0);
