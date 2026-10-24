-- cs2dm: епоха на статистиките (CONTRACT.md §3) — за ръчната редакция от панела. Само добавяне
-- (колони с DEFAULT 0 — съществуващите редове са епоха 0, нищо не се пренаписва).
-- Панелът вдига players.stats_epoch и епохата на всички редове на играча при редакция; плъгинът
-- праща епохата си с всяка партида и пише в ред само ако неговата епоха ≤ тази на партидата.

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "stats_epoch" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "player_season_stats" ADD COLUMN     "stats_epoch" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "weapon_season_stats" ADD COLUMN     "stats_epoch" INTEGER NOT NULL DEFAULT 0;
