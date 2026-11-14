#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fakturist/deploy/setup-env.sh — еднократно на сървъра, преди първия деплой: папката на Фактурист и
# .env с генерирани тайни (mode 600). Не пита нищо и не показва тайните: паролата на базата,
# JWT_SECRET и LEDGER_SEAL_KEY не стигат до екрана и до историята на шела.
#
#   sudo bash fakturist/deploy/setup-env.sh
#   sudo FAKTURIST_HTTP_PORT=4341 bash fakturist/deploy/setup-env.sh    # ако 4340 е зает (ss -tlnp)
#
# Brevo SMTP и Revolut се попълват в мастър панела → Настройки (шифровани в базата), не тук.
# Никога не презаписва съществуващ .env: нова POSTGRES_PASSWORD не пасва на съществуващата база, а нов
# LEDGER_SEAL_KEY чупи веригата на документите. Промяна — `sudoedit /opt/few-few/shared/fakturist/.env`.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${FAKTURIST_SHARED:-/opt/few-few/shared/fakturist}"
DOMAIN="${FAKTURIST_DOMAIN:-fakturist.carbonstealth.eu}"
HTTP_PORT="${FAKTURIST_HTTP_PORT:-}"
ENV_FILE="$SHARED/.env"

ok()   { printf '\033[32m✔ fakturist: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ fakturist: %s\033[0m\n' "$*" >&2; }
fail() { printf '\033[31m✘ fakturist: %s\033[0m\n' "$*" >&2; exit 1; }

main() {
  [ "$(id -u)" = "0" ] || fail "пусни като root (sudo)."
  command -v openssl >/dev/null 2>&1 || fail "липсва openssl."
  [ ! -e "$ENV_FILE" ] || fail "$ENV_FILE вече съществува — не го пипам. Промяна: sudoedit $ENV_FILE"
  # Том с база без .env = загубени тайни, не нова машина: нова парола не отваря старата база, а нов
  # LEDGER_SEAL_KEY не проверява издадените документи. Връща се старият .env от бекъпа на тайните.
  if command -v docker >/dev/null 2>&1 && docker volume inspect fakturist_db-data >/dev/null 2>&1; then
    fail "има том fakturist_db-data от предишна инсталация, а .env липсва — върни стария .env в $ENV_FILE от бекъпа на тайните; нови тайни няма да пасват."
  fi
  if [ -n "$HTTP_PORT" ]; then
    printf '%s' "$HTTP_PORT" | grep -Eqx '[0-9]{2,5}' || fail "FAKTURIST_HTTP_PORT трябва да е число."
  fi

  install -d -m 700 "$SHARED" "$SHARED/backups"
  local tmp
  tmp="$(mktemp "$SHARED/.env.XXXXXX")"
  {
    printf 'PUBLIC_BASE_URL=https://%s\n' "$DOMAIN"
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'LEDGER_SEAL_KEY=%s\n' "$(openssl rand -hex 32)"
    # Правните текстове са публикувани (13.11.2026); спира се и от панела (registration.enabled).
    printf 'REGISTRATION_OPEN=true\n'
    [ -z "$HTTP_PORT" ] || printf 'HTTP_PORT=%s\n' "$HTTP_PORT"
  } >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$ENV_FILE"
  ok "$ENV_FILE е готов (600): паролата на базата, JWT_SECRET и LEDGER_SEAL_KEY са генерирани."
  warn "LEDGER_SEAL_KEY не се сменя НИКОГА след първата фактура — копирай $ENV_FILE извън сървъра (бекъпа на тайните) още сега."
}

# Изпълнен — пише .env; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
