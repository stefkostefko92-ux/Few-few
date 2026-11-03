#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# semki/deploy/setup-env.sh — еднократно на сървъра, преди първия деплой: папката на Semki и .env
# с генерирани тайни (DEPLOY.md, т. 2). Пита за данните на Discord приложението; токенът и client
# secret-ът не се показват на екрана и не остават в историята на шела.
#
#   sudo bash semki/deploy/setup-env.sh
#
# Никога не презаписва съществуващ .env: нова POSTGRES_PASSWORD не пасва на съществуващата база.
# Промяна — `sudoedit /opt/few-few/shared/semki/.env`, после деплой.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${SEMKI_SHARED:-/opt/few-few/shared/semki}"
DOMAIN="${SEMKI_DOMAIN:-vps2.carbonstealth.eu}"
ENV_FILE="$SHARED/.env"

ok()   { printf '\033[32m✔ semki: %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✘ semki: %s\033[0m\n' "$*" >&2; exit 1; }

# Стойност, която влиза в .env без кавички: интервал, кавичка, „#“, „$“ или „\“ биха я счупили.
plain() {
  case "$2" in *[[:space:]\'\"\#\$\\]*) fail "$1 съдържа интервал, кавичка, #, \$ или \\ — не влиза в .env без кавички." ;; esac
  [ -n "$2" ] || fail "$1 е празно."
}

snowflake() {
  printf '%s' "$2" | grep -Eqx '[0-9]{17,20}' || fail "$1 трябва да е Discord ID (17–20 цифри)."
}

main() {
  [ "$(id -u)" = "0" ] || fail "пусни като root (sudo)."
  command -v openssl >/dev/null 2>&1 || fail "липсва openssl."
  [ ! -e "$ENV_FILE" ] || fail "$ENV_FILE вече съществува — не го пипам. Промяна: sudoedit $ENV_FILE"

  local client_id guild_id bot_token client_secret
  read -rp 'Discord Application ID (General Information): ' client_id
  snowflake 'Application ID' "$client_id"
  read -rsp 'Discord Client Secret (OAuth2): ' client_secret && echo
  plain 'Client Secret' "$client_secret"
  read -rsp 'Discord Bot Token (Bot → Reset Token): ' bot_token && echo
  plain 'Bot Token' "$bot_token"
  read -rp 'Server ID на Discord сървъра: ' guild_id
  snowflake 'Server ID' "$guild_id"

  install -d -m 700 "$SHARED" "$SHARED/backups"
  local tmp
  tmp="$(mktemp "$SHARED/.env.XXXXXX")"
  {
    printf 'PUBLIC_BASE_URL=https://%s\n' "$DOMAIN"
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'DISCORD_CLIENT_ID=%s\n' "$client_id"
    printf 'DISCORD_CLIENT_SECRET=%s\n' "$client_secret"
    printf 'DISCORD_TOKEN=%s\n' "$bot_token"
    printf 'DISCORD_GUILD_ID=%s\n' "$guild_id"
  } >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$ENV_FILE"
  ok "$ENV_FILE е готов (600): паролата на базата и ключът на сесиите са генерирани."
  ok "в Discord Developer Portal → OAuth2 → Redirects добави: https://$DOMAIN/auth/callback"
}

# Изпълнен — пише .env; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
