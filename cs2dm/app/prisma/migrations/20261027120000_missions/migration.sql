-- cs2dm: мисиите за деня (CONTRACT.md §16) и периодът на значките (§16–17). Само добавяне — нищо съществуващо
-- не се променя. mission_progress — пише го плъгинът (GREATEST/COALESCE), срок 90 дни (§7, работникът трие);
-- player_badges.period — значка веднъж на период (ден за серията от мисии, седмица за купата), уникалността я
-- прави идемпотентна; старите значки (zone_king) остават с NULL и не се сблъскват.

-- AlterTable
ALTER TABLE "player_badges" ADD COLUMN     "period" VARCHAR(16);

-- CreateTable
CREATE TABLE "mission_progress" (
    "id" BIGSERIAL NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "day" DATE NOT NULL,
    "mission_key" VARCHAR(32) NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mission_progress_day_idx" ON "mission_progress"("day");

-- CreateIndex
CREATE UNIQUE INDEX "mission_progress_steam_id_day_mission_key_key" ON "mission_progress"("steam_id", "day", "mission_key");

-- CreateIndex
CREATE INDEX "player_badges_kind_period_idx" ON "player_badges"("kind", "period");

-- CreateIndex
CREATE UNIQUE INDEX "player_badges_steam_id_kind_period_key" ON "player_badges"("steam_id", "kind", "period");

-- AddForeignKey
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ===== cs2dm: ръчни допълнения към генерираната миграция =====
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_key_check" CHECK ("mission_key" ~ '^[a-z]+_[0-9]{1,3}$');
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_target_check" CHECK ("target" BETWEEN 1 AND 1000);
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_progress_check" CHECK ("progress" BETWEEN 0 AND "target");
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_done_check"
  CHECK ("completed_at" IS NULL OR "progress" = "target");
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_period_check"
  CHECK ("period" IS NULL OR "period" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
