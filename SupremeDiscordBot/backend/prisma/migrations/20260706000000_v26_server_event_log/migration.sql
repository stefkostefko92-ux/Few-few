-- Server event logging: per-server opt-in config + activity log table

ALTER TABLE "servers" ADD COLUMN "eventLogEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "servers" ADD COLUMN "eventLogChannelId" TEXT;
ALTER TABLE "servers" ADD COLUMN "eventLogCategories" TEXT[] DEFAULT ARRAY['voice','members','moderation']::TEXT[];

CREATE TABLE "server_event_logs" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorTag" TEXT,
    "targetId" TEXT NOT NULL,
    "targetTag" TEXT,
    "channelId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "server_event_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "server_event_logs_serverId_createdAt_idx" ON "server_event_logs"("serverId", "createdAt");

ALTER TABLE "server_event_logs" ADD CONSTRAINT "server_event_logs_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
