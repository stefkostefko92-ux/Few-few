-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deviceConsentAt" TIMESTAMP(3),
ADD COLUMN     "deviceConsentVersion" TEXT;
