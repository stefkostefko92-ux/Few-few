-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "lastAutopilotAt" TIMESTAMP(3),
ADD COLUMN     "managed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "plan" JSONB;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "crossPostVariants" JSONB,
ADD COLUMN     "suggestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MediaInsight" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER,
    "reach" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saved" INTEGER,
    "shares" INTEGER,
    "totalInteractions" INTEGER,

    CONSTRAINT "MediaInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountInsight" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "reach" INTEGER,
    "views" INTEGER,
    "followerCount" INTEGER,
    "engaged" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaInsight_postId_fetchedAt_idx" ON "MediaInsight"("postId", "fetchedAt");

-- CreateIndex
CREATE INDEX "AccountInsight_accountId_day_idx" ON "AccountInsight"("accountId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AccountInsight_accountId_day_key" ON "AccountInsight"("accountId", "day");

-- AddForeignKey
ALTER TABLE "MediaInsight" ADD CONSTRAINT "MediaInsight_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountInsight" ADD CONSTRAINT "AccountInsight_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

