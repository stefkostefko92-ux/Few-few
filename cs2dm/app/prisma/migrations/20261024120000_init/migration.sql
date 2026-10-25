-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLAYER', 'VIP', 'HELPER', 'MODERATOR', 'ADMIN', 'HEADADMIN', 'OWNER');

-- CreateEnum
CREATE TYPE "PunishmentType" AS ENUM ('BAN', 'MUTE', 'GAG', 'SILENCE', 'WARN', 'KICK');

-- CreateEnum
CREATE TYPE "PunishmentCategory" AS ENUM ('CHEATING', 'TOXICITY', 'EXPLOIT', 'SPAM', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('GAME', 'WEB', 'DISCORD', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VipRequestStatus" AS ENUM ('PENDING', 'AWAITING_PAYMENT', 'PAID', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "players" (
    "steam_id" VARCHAR(17) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "lang" VARCHAR(5) NOT NULL DEFAULT 'en',
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playtime_sec" INTEGER NOT NULL DEFAULT 0,
    "avatar_url" VARCHAR(255),
    "web_login_at" TIMESTAMPTZ(3),
    "discord_id" VARCHAR(20),
    "linked_at" TIMESTAMPTZ(3),
    "totp_secret_enc" TEXT,
    "totp_enabled_at" TIMESTAMPTZ(3),
    "hidden_from_leaderboards" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "players_pkey" PRIMARY KEY ("steam_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" BIGSERIAL NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "ip" INET,
    "connected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_season_stats" (
    "steam_id" VARCHAR(17) NOT NULL,
    "season_id" INTEGER NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "headshots" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "damage" INTEGER NOT NULL DEFAULT 0,
    "shots_fired" INTEGER NOT NULL DEFAULT 0,
    "shots_hit" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "bounties_claimed" INTEGER NOT NULL DEFAULT 0,
    "revenges" INTEGER NOT NULL DEFAULT 0,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "playtime_sec" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_season_stats_pkey" PRIMARY KEY ("steam_id","season_id")
);

-- CreateTable
CREATE TABLE "weapon_season_stats" (
    "steam_id" VARCHAR(17) NOT NULL,
    "season_id" INTEGER NOT NULL,
    "weapon" VARCHAR(32) NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "headshots" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "weapon_season_stats_pkey" PRIMARY KEY ("steam_id","season_id","weapon")
);

-- CreateTable
CREATE TABLE "kills" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "season_id" INTEGER NOT NULL,
    "mode" VARCHAR(32) NOT NULL,
    "attacker_id" VARCHAR(17),
    "victim_id" VARCHAR(17) NOT NULL,
    "weapon" VARCHAR(32) NOT NULL,
    "headshot" BOOLEAN NOT NULL DEFAULT false,
    "wallbang" BOOLEAN NOT NULL DEFAULT false,
    "noscope" BOOLEAN NOT NULL DEFAULT false,
    "through_smoke" BOOLEAN NOT NULL DEFAULT false,
    "attacker_blind" BOOLEAN NOT NULL DEFAULT false,
    "distance" REAL NOT NULL,
    "ax" REAL NOT NULL,
    "ay" REAL NOT NULL,
    "az" REAL NOT NULL,
    "vx" REAL NOT NULL,
    "vy" REAL NOT NULL,
    "vz" REAL NOT NULL,

    CONSTRAINT "kills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punishments" (
    "id" SERIAL NOT NULL,
    "type" "PunishmentType" NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "target_name" VARCHAR(64) NOT NULL,
    "category" "PunishmentCategory" NOT NULL DEFAULT 'OTHER',
    "reason" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "actor_steam_id" VARCHAR(17),
    "source" "Source" NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by" VARCHAR(17),
    "revoke_reason" VARCHAR(255),

    CONSTRAINT "punishments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" SERIAL NOT NULL,
    "punishment_id" INTEGER NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "contact" VARCHAR(255),
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMPTZ(3),
    "handled_by" VARCHAR(17),
    "decision_note" VARCHAR(1000),

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "reporter_steam_id" VARCHAR(17),
    "target_steam_id" VARCHAR(17) NOT NULL,
    "target_name" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "source" "Source" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMPTZ(3),
    "handled_by" VARCHAR(17),
    "note" VARCHAR(500),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vip_tiers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "period_days" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vip_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vip_grants" (
    "id" SERIAL NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "tier_id" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "amount_cents" INTEGER,
    "payment_method" VARCHAR(32),
    "invoice_no" VARCHAR(32),
    "request_id" INTEGER,
    "granted_by" VARCHAR(17) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "vip_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vip_requests" (
    "id" SERIAL NOT NULL,
    "steam_id" VARCHAR(17) NOT NULL,
    "tier_id" INTEGER NOT NULL,
    "periods" INTEGER NOT NULL DEFAULT 1,
    "billing_name" VARCHAR(128) NOT NULL,
    "billing_address" VARCHAR(255) NOT NULL,
    "billing_tax_id" VARCHAR(32),
    "email" VARCHAR(255) NOT NULL,
    "immediate_start_consent" BOOLEAN NOT NULL,
    "terms_version" VARCHAR(16) NOT NULL,
    "status" "VipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMPTZ(3),
    "handled_by" VARCHAR(17),

    CONSTRAINT "vip_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_steam_id" VARCHAR(17),
    "action" VARCHAR(64) NOT NULL,
    "target_steam_id" VARCHAR(17),
    "details" JSONB NOT NULL DEFAULT '{}',
    "source" "Source" NOT NULL,
    "prev_hash" CHAR(64),
    "hash" CHAR(64),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_discord_id_key" ON "players"("discord_id");

-- CreateIndex
CREATE INDEX "players_last_seen_at_idx" ON "players"("last_seen_at");

-- CreateIndex
CREATE INDEX "players_role_idx" ON "players"("role");

-- CreateIndex
CREATE INDEX "sessions_steam_id_connected_at_idx" ON "sessions"("steam_id", "connected_at");

-- CreateIndex
CREATE INDEX "sessions_connected_at_idx" ON "sessions"("connected_at");

-- CreateIndex
CREATE INDEX "player_season_stats_season_id_xp_idx" ON "player_season_stats"("season_id", "xp" DESC);

-- CreateIndex
CREATE INDEX "player_season_stats_season_id_kills_idx" ON "player_season_stats"("season_id", "kills" DESC);

-- CreateIndex
CREATE INDEX "weapon_season_stats_season_id_weapon_kills_idx" ON "weapon_season_stats"("season_id", "weapon", "kills" DESC);

-- CreateIndex
CREATE INDEX "kills_at_idx" ON "kills"("at");

-- CreateIndex
CREATE INDEX "kills_attacker_id_at_idx" ON "kills"("attacker_id", "at");

-- CreateIndex
CREATE INDEX "kills_victim_id_at_idx" ON "kills"("victim_id", "at");

-- CreateIndex
CREATE INDEX "punishments_steam_id_type_revoked_at_idx" ON "punishments"("steam_id", "type", "revoked_at");

-- CreateIndex
CREATE INDEX "punishments_type_created_at_idx" ON "punishments"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "appeals_status_created_at_idx" ON "appeals"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_target_steam_id_idx" ON "reports"("target_steam_id");

-- CreateIndex
CREATE UNIQUE INDEX "vip_tiers_code_key" ON "vip_tiers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vip_grants_request_id_key" ON "vip_grants"("request_id");

-- CreateIndex
CREATE INDEX "vip_grants_steam_id_ends_at_idx" ON "vip_grants"("steam_id", "ends_at");

-- CreateIndex
CREATE INDEX "vip_requests_status_created_at_idx" ON "vip_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_target_steam_id_idx" ON "audit_log"("target_steam_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weapon_season_stats" ADD CONSTRAINT "weapon_season_stats_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weapon_season_stats" ADD CONSTRAINT "weapon_season_stats_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punishments" ADD CONSTRAINT "punishments_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_punishment_id_fkey" FOREIGN KEY ("punishment_id") REFERENCES "punishments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_grants" ADD CONSTRAINT "vip_grants_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_grants" ADD CONSTRAINT "vip_grants_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "vip_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_grants" ADD CONSTRAINT "vip_grants_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "vip_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_requests" ADD CONSTRAINT "vip_requests_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_requests" ADD CONSTRAINT "vip_requests_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "vip_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== cs2dm: ръчни допълнения към генерираната миграция =====

-- Одит-верига: всеки ред носи sha256(предишен hash | съдържание). Тригерът е в базата, за да е
-- верига при няколко писача (C# плъгинът, сайтът, ботът). Ключалката подрежда вмъкванията, а
-- id се взима ПОД ключалката — така редът по id е редът на веригата.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION audit_log_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  last_hash CHAR(64);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cs2dm_audit_log_chain'));
  NEW.id := nextval(pg_get_serial_sequence('audit_log', 'id'));
  SELECT hash INTO last_hash FROM audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.hash := encode(digest(
    coalesce(last_hash, '') || '|' ||
    to_char(NEW.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' ||
    coalesce(NEW.actor_steam_id, '') || '|' ||
    NEW.action || '|' ||
    coalesce(NEW.target_steam_id, '') || '|' ||
    NEW.details::text || '|' ||
    NEW.source::text, 'sha256'), 'hex');
  RETURN NEW;
END $$;

CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

-- Сезон 0 = за всички времена (агрегатите на плъгина пишат в 0 и в текущия); сезон 1 започва сега.
INSERT INTO seasons (id, name, starts_at) VALUES (0, 'All-time', CURRENT_TIMESTAMP), (1, 'Season 1', CURRENT_TIMESTAMP);
