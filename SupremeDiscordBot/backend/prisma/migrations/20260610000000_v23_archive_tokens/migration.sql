-- Archive access tokens: public archive pages must not be reachable by
-- guessing/enumerating ticket IDs (transcripts contain PII).
ALTER TABLE "tickets" ADD COLUMN "archiveToken" TEXT;

-- Backfill every existing ticket with a random 32-hex-char token.
UPDATE "tickets"
SET "archiveToken" = md5(random()::text || clock_timestamp()::text || id);

-- Rewrite stored archive URLs to include the token so previously shared
-- dashboard links keep working in their tokenized form.
UPDATE "tickets"
SET "archiveUrl" = '/archive/ticket/' || id || '?t=' || "archiveToken"
WHERE "archiveUrl" IS NOT NULL;
