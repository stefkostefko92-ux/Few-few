-- Автоматичен превод на профилите (docs/geo-autotranslate-spec.md). Адитивно:
-- нови колони с подразбиране и нова таблица — старият код работи с новата схема.

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "autoTranslateMode" TEXT NOT NULL DEFAULT 'on',
ADD COLUMN "autoTranslateStartsAt" TIMESTAMP(3);

-- Профилите отпреди функцията НЕ се включват веднага: първо уведомление до
-- създателите (бутон в админа), после включване след ≥14 дни (правен преглед,
-- ОРЗД чл. 12–13: предварителна прозрачност). Новите профили са „on“.
UPDATE "Profile" SET "autoTranslateMode" = 'pending';

-- CreateTable
CREATE TABLE "AutoTranslation" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoTranslation_profileId_locale_key" ON "AutoTranslation"("profileId", "locale");

-- AddForeignKey
ALTER TABLE "AutoTranslation" ADD CONSTRAINT "AutoTranslation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
