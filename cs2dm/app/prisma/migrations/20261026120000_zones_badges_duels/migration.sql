-- cs2dm: „Горещата зона“, значките и дуелите (CONTRACT.md §15). Само добавяне — нищо съществуващо не се променя.
-- map_zones — от `!zone add` (HEADADMIN+, одит); player_badges — пазят се, докато играчът съществува;
-- duels — срок 90 дни (§7, работникът трие).

-- CreateTable
CREATE TABLE "map_zones" (
    "id" SERIAL NOT NULL,
    "map" VARCHAR(64) NOT NULL,
    "name" VARCHAR(24) NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "z" REAL NOT NULL,
    "radius" INTEGER NOT NULL,
    "created_by" VARCHAR(17),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_badges" (
    "id" BIGSERIAL NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "earned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "player_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duels" (
    "id" SERIAL NOT NULL,
    "winner_id" VARCHAR(17) NOT NULL,
    "loser_id" VARCHAR(17) NOT NULL,
    "winner_score" INTEGER NOT NULL,
    "loser_score" INTEGER NOT NULL,
    "draw" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "duels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "map_zones_map_idx" ON "map_zones"("map");

-- CreateIndex
CREATE INDEX "player_badges_steam_id_earned_at_idx" ON "player_badges"("steam_id", "earned_at");

-- CreateIndex
CREATE INDEX "duels_winner_id_idx" ON "duels"("winner_id");

-- CreateIndex
CREATE INDEX "duels_loser_id_idx" ON "duels"("loser_id");

-- CreateIndex
CREATE INDEX "duels_ended_at_idx" ON "duels"("ended_at");

-- AddForeignKey
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_loser_id_fkey" FOREIGN KEY ("loser_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ===== cs2dm: ръчни допълнения към генерираната миграция =====
ALTER TABLE "map_zones" ADD CONSTRAINT "map_zones_radius_check" CHECK ("radius" BETWEEN 100 AND 800);
ALTER TABLE "map_zones" ADD CONSTRAINT "map_zones_name_check" CHECK ("name" ~ '^[A-Za-z0-9 _-]{1,24}$');
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_kind_check" CHECK ("kind" ~ '^[a-z_]{1,32}$');
ALTER TABLE "duels" ADD CONSTRAINT "duels_players_check" CHECK ("winner_id" <> "loser_id");
ALTER TABLE "duels" ADD CONSTRAINT "duels_score_check"
  CHECK ("winner_score" BETWEEN 0 AND 100 AND "loser_score" BETWEEN 0 AND 100);
ALTER TABLE "duels" ADD CONSTRAINT "duels_draw_check" CHECK (NOT "draw" OR "winner_score" = "loser_score");
ALTER TABLE "duels" ADD CONSTRAINT "duels_time_check" CHECK ("ended_at" >= "started_at");
