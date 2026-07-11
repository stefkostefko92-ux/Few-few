-- AlterEnum
ALTER TYPE "BlockKind" ADD VALUE 'POLL';
ALTER TYPE "BlockKind" ADD VALUE 'BOOKING';

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PollVote_linkId_idx" ON "PollVote"("linkId");

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;
