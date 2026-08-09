-- v2.9 — Canned responses (/tag) — #1 staff request (Ticket Tool parity).
-- Name is scoped unique per server (not globally) — two different servers can
-- both have a tag named "rules". Validation of length/kebab-case happens
-- bot-side before create; the column itself has no CHECK constraint (mirrors
-- how other bot-facing text fields in this schema are validated).

CREATE TABLE "canned_responses" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "canned_responses_serverId_name_key" ON "canned_responses"("serverId", "name");

CREATE INDEX "canned_responses_serverId_idx" ON "canned_responses"("serverId");
