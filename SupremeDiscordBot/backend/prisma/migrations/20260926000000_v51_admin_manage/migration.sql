-- v51 — админ конзола: черен списък с причина и срок, вътрешна бележка за
-- потребител, пауза на white-label бота. Само нови nullable колони (адитивна
-- миграция; нищо съществуващо не се пипа, откатът на кода е безопасен).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "blacklistReason" TEXT,
ADD COLUMN     "blacklistedAt" TIMESTAMP(3),
ADD COLUMN     "blacklistedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "customBotPausedAt" TIMESTAMP(3);
