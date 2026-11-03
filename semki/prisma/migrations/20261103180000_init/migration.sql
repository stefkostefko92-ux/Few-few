-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('PERCENT', 'HOURS_LEFT');

-- CreateTable
CREATE TABLE "SeedType" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "decayPercent" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "decayMinutes" INTEGER NOT NULL DEFAULT 60,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedType_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" SERIAL NOT NULL,
    "seedTypeKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "anchoredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" SERIAL NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "seedTypeKey" TEXT,
    "channelId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "batchId" INTEGER NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "silent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("batchId","ruleId")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "dashboardRoleId" TEXT,
    "commandRoleId" TEXT,
    "quietEnabled" BOOLEAN NOT NULL DEFAULT false,
    "windowStart" TEXT NOT NULL DEFAULT '10:00',
    "windowEnd" TEXT NOT NULL DEFAULT '23:00',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Sofia',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Batch_seedTypeKey_idx" ON "Batch"("seedTypeKey");

-- CreateIndex
CREATE INDEX "AlertRule_seedTypeKey_idx" ON "AlertRule"("seedTypeKey");

-- CreateIndex
CREATE INDEX "Notification_ruleId_idx" ON "Notification"("ruleId");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_seedTypeKey_fkey" FOREIGN KEY ("seedTypeKey") REFERENCES "SeedType"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_seedTypeKey_fkey" FOREIGN KEY ("seedTypeKey") REFERENCES "SeedType"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Граници и в базата, не само в zod (Prisma не моделира CHECK — затова са тук, на ръка).
ALTER TABLE "SeedType" ADD CONSTRAINT "SeedType_decay_check" CHECK ("decayPercent" > 0 AND "decayPercent" <= 100 AND "decayMinutes" BETWEEN 1 AND 10080);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_count_check" CHECK ("count" BETWEEN 1 AND 100000);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_percent_check" CHECK ("percent" >= 0 AND "percent" <= 100);
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_threshold_check" CHECK ("threshold" >= 0 AND "threshold" <= 10000);
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_singleton_check" CHECK ("id" = 1);

-- Петте вида семки: 0,6% на 60 минути (100% → 0% за ~166 ч 40 мин). Скоростта се сменя от дашборда.
INSERT INTO "SeedType" ("key", "label", "decayPercent", "decayMinutes", "sortOrder", "updatedAt") VALUES
  ('amnesia', 'Amnesia', 0.6, 60, 1, CURRENT_TIMESTAMP),
  ('ak', 'AK', 0.6, 60, 2, CURRENT_TIMESTAMP),
  ('ogkush', 'OG Kush', 0.6, 60, 3, CURRENT_TIMESTAMP),
  ('purple', 'Purple', 0.6, 60, 4, CURRENT_TIMESTAMP),
  ('skunk', 'Skunk', 0.6, 60, 5, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Settings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
