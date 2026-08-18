-- v33 — Reaction Roles (react → get a role).
-- Едно съобщение (embed) с N двойки emoji → роля; ботът слуша
-- messageReactionAdd/Remove и дава/маха ролята. exclusive = radio режим.
-- Виж bot/src/events/messageReactionAdd.js и routes/reactionroles.js.

CREATE TABLE "reaction_role_messages" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#5865F2',
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reaction_role_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reaction_role_messages_messageId_key" ON "reaction_role_messages"("messageId");
CREATE INDEX "reaction_role_messages_serverId_idx" ON "reaction_role_messages"("serverId");

ALTER TABLE "reaction_role_messages" ADD CONSTRAINT "reaction_role_messages_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reaction_role_pairs" (
    "id" TEXT NOT NULL,
    "rrmId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "reaction_role_pairs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reaction_role_pairs_rrmId_emoji_key" ON "reaction_role_pairs"("rrmId", "emoji");

ALTER TABLE "reaction_role_pairs" ADD CONSTRAINT "reaction_role_pairs_rrmId_fkey"
    FOREIGN KEY ("rrmId") REFERENCES "reaction_role_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
