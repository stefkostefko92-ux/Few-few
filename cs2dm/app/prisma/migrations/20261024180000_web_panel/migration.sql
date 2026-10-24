-- cs2dm, етап 2: уеб панелът (CONTRACT.md §10). Само добавяне — нищо съществуващо не се променя.
-- Сесиите (токенът само като sha256), резервните кодове за TOTP (само HMAC) и последната приета
-- TOTP стъпка (против повторна употреба на код). C# плъгинът не чете и не пише тези колони.

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "totp_last_step" INTEGER;

-- CreateTable
CREATE TABLE "web_sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "role" "Role" NOT NULL,
    "csrf_token" VARCHAR(64) NOT NULL,
    "mfa_passed" BOOLEAN NOT NULL DEFAULT false,
    "mfa_failures" INTEGER NOT NULL DEFAULT 0,
    "lang" VARCHAR(5) NOT NULL DEFAULT 'bg',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "web_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_recovery_codes" (
    "id" SERIAL NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_sessions_token_hash_key" ON "web_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "web_sessions_steam_id_idx" ON "web_sessions"("steam_id");

-- CreateIndex
CREATE INDEX "web_sessions_expires_at_idx" ON "web_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "web_recovery_codes_steam_id_code_hash_key" ON "web_recovery_codes"("steam_id", "code_hash");

-- AddForeignKey
ALTER TABLE "web_sessions" ADD CONSTRAINT "web_sessions_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_recovery_codes" ADD CONSTRAINT "web_recovery_codes_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;
