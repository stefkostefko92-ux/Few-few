-- AlterTable
ALTER TABLE "Faq" ADD COLUMN     "localNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Outage" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceUrl" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ScamAlert" ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceUrl" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedSource" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "topics" TEXT NOT NULL DEFAULT 'outages,scams',
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lastOkAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyRoster" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pharmacy" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "hours" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyRoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT '/',
    "label" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obituary" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NECROLOGY',
    "fullName" TEXT NOT NULL,
    "birthYear" INTEGER,
    "deathDate" TIMESTAMP(3),
    "ceremonyAt" TIMESTAMP(3),
    "ceremonyPlace" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "fromFamily" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obituary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneReport" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyStat_day_metric_idx" ON "DailyStat"("day", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_day_metric_path_source_key" ON "DailyStat"("day", "metric", "path", "source");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "DutyRoster_published_date_idx" ON "DutyRoster"("published", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_code_key" ON "ShortLink"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Obituary_slug_key" ON "Obituary"("slug");

-- CreateIndex
CREATE INDEX "Obituary_published_createdAt_idx" ON "Obituary"("published", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneReport_resolved_createdAt_idx" ON "PhoneReport"("resolved", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Outage_externalId_key" ON "Outage"("externalId");


-- ── Данни: първото впечатление ────────────────────────────────────────────────
-- Примерните записи от началния сийд бяха публикувани на живо („Примерно събитие
-- в Бобов дол“, „Примерна обява…“, „примерен спомен…“) и внушаваха изоставен
-- сайт. Само се СКРИВАТ (published=false) — остават в базата и се връщат от админа.
UPDATE "Event"     SET "published" = false WHERE "slug" = 'primerno-sabitie';
UPDATE "Rideshare" SET "published" = false WHERE "slug" = 'bobov-dol-dupnitsa-primer';
UPDATE "Memory"    SET "published" = false WHERE "slug" = 'spomen-praznikat-na-minora';
UPDATE "Business"  SET "published" = false WHERE "slug" IN ('primeren-magazin', 'primerno-zavedenie');

-- „Новините от общината“ всъщност бяха страници от МЕНЮТО на портала на общината
-- (декларации, структура, правомощия), внесени погрешно от ingest-news. Не са
-- новини — скриват се. Поправката на вноса е в src/lib/ingest-news.ts.
UPDATE "Post" SET "published" = false WHERE "slug" IN (
  'deklaratsii-po-chl-35-ot-zpkonpi-2022g',
  'deklaratsii-po-chl-35-ot-zpkonpi-2023g',
  'deklaratsii-po-chl-49-ot-zpk-2023g',
  'deklaratsii-po-chl-49-ot-zpk-2024g',
  'deklaratsii-po-chl-75-al-1t-2-ot-zsp-2025g',
  'deklaratsii-po-zpkonpi',
  'dobre-doshli',
  'harakteristiki-na-obshtinata',
  'pravomoshtiya-na-kmeta',
  'protsesi-na-vzemane-na-resheniya',
  'simvoli-i-pochetni-grazhdani',
  'spisak-na-izdadenite-aktove',
  'struktura-i-funktsii',
  'upravlenska-programa',
  'ustroystven-pravilnik',
  'zashtita-pri-bedstviya-i-avarii'
);
