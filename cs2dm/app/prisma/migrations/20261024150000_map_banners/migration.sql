-- CreateTable
CREATE TABLE "map_banners" (
    "id" SERIAL NOT NULL,
    "map" VARCHAR(64) NOT NULL,
    "banner_key" VARCHAR(32) NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "z" REAL NOT NULL,
    "pitch" REAL NOT NULL,
    "yaw" REAL NOT NULL,
    "roll" REAL NOT NULL,
    "created_by" VARCHAR(17),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "map_banners_map_idx" ON "map_banners"("map");

