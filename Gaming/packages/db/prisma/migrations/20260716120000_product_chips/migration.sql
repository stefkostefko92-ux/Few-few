-- Product: chips granted for CHIP_PACK products, so the admin store editor can
-- manage chip grants alongside gems. Nullable + additive (no backfill needed;
-- the runtime grant path also reads the static CATALOG).
ALTER TABLE "Product" ADD COLUMN "chips" INTEGER;
