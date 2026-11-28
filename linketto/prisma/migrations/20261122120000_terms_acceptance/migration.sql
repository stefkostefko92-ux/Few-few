-- Приемане на Общите условия при регистрация (ЗЗП чл. 147а): кога и коя версия. Адитивно.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
