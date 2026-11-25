-- CreateEnum
CREATE TYPE "ServerSource" AS ENUM ('SUBMITTED', 'DISCOVERED');

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "iconVersion" INTEGER,
ADD COLUMN     "lastSeenInListAt" TIMESTAMP(3),
ADD COLUMN     "source" "ServerSource" NOT NULL DEFAULT 'SUBMITTED';
