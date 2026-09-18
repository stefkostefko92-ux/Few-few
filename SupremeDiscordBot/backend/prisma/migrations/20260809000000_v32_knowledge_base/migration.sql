-- v32 — Knowledge Base (staff-written articles, auto-suggested on new tickets).
-- Ticket Tool differentiator. See lib/kbMatch.js for the suggestion scoring
-- function and routes/bot_v18.js for the bot-secret suggest/feedback endpoints.

CREATE TABLE "kb_articles" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kb_articles_serverId_idx" ON "kb_articles"("serverId");

ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
