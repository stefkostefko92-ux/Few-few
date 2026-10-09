/*
  Warnings:

  - A unique constraint covering the columns `[number]` on the table `UpgradeRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "UpgradeRequest" ADD COLUMN     "number" SERIAL NOT NULL;

-- Съществуващите поръчки се номерират по реда на поръчване (SERIAL ги номерира по реда на редовете в
-- таблицата); същите числа 1..N, така че последовността продължава от N.
UPDATE "UpgradeRequest" AS u
SET "number" = o.n
FROM (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS n FROM "UpgradeRequest") AS o
WHERE u."id" = o."id";

-- CreateIndex
CREATE UNIQUE INDEX "UpgradeRequest_number_key" ON "UpgradeRequest"("number");
