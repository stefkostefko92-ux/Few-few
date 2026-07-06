-- Server event logging: per-server opt-in config only.
-- Events are relayed to the server's own Discord log channel in real time —
-- NOT stored in our database (owner decision), so no log table.

ALTER TABLE "servers" ADD COLUMN "eventLogEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "servers" ADD COLUMN "eventLogChannelId" TEXT;
ALTER TABLE "servers" ADD COLUMN "eventLogCategories" TEXT[] DEFAULT ARRAY['voice','members','moderation']::TEXT[];
