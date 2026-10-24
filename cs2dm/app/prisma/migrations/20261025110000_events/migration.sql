-- cs2dm: събития по график (CONTRACT.md §12). Само добавяне — нищо съществуващо не се променя.

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('XP_BOOST', 'MODE', 'COMMUNITY');

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "kind" "EventKind" NOT NULL,
    "title_bg" VARCHAR(80) NOT NULL,
    "title_en" VARCHAR(80) NOT NULL,
    "title_it" VARCHAR(80) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "xp_multiplier" DECIMAL(2,1) NOT NULL DEFAULT 1.0,
    "dm_mode_id" INTEGER,
    "created_by" VARCHAR(17) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" VARCHAR(17),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_starts_at_idx" ON "events"("starts_at");

-- CreateIndex
CREATE INDEX "events_ends_at_idx" ON "events"("ends_at");


-- ===== cs2dm: ръчни допълнения към генерираната миграция =====
-- Prisma не описва CHECK/EXCLUDE — пазят договора в базата, дори панелът да сгреши. GiST върху
-- tstzrange е вграден (без разширение). Отменените събития не пречат на нови в същия интервал.
ALTER TABLE "events" ADD CONSTRAINT "events_time_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "events" ADD CONSTRAINT "events_xp_multiplier_check"
  CHECK ("xp_multiplier" >= 1.0 AND "xp_multiplier" <= 3.0);
ALTER TABLE "events" ADD CONSTRAINT "events_dm_mode_check" CHECK ("dm_mode_id" IS NULL OR "dm_mode_id" >= 0);
ALTER TABLE "events" ADD CONSTRAINT "events_no_overlap"
  EXCLUDE USING gist (tstzrange("starts_at", "ends_at") WITH &&) WHERE ("cancelled_at" IS NULL);
