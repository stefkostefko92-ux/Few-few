#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fakturist/deploy/create-owner.sh — мастър акаунтът и плановете, веднъж след първия деплой
# (src/scripts/create-owner.ts). При първия вход паролата се сменя и 2FA е задължителна.
#
#   sudo bash /opt/few-few/current/fakturist/deploy/create-owner.sh
#
# Паролата се въвежда скрито и стига до контейнера през stdin (here-string на bash): не остава в
# историята на шела, във файл, в командния ред на docker (`ps`, /proc/<pid>/cmdline) или в
# `docker inspect` (не е `-e`). Минава същата проверка като всички (src/auth/password.ts).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SHARED="${FAKTURIST_SHARED:-/opt/few-few/shared/fakturist}"

fail() { printf '\033[31m✘ fakturist: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || fail "пусни като root (sudo)."
app="$(head -n 1 "$SHARED/last-good" 2>/dev/null || true)"
[ -n "$app" ] && [ -f "$app/docker-compose.yml" ] || fail "няма работещ release ($SHARED/last-good) — първо деплой."
cd "$app"

read -rp 'Имейл [admin@carbonstealth.eu]: ' email
email="${email:-admin@carbonstealth.eu}"
read -rp 'Име [Carbon Stealth VCC]: ' name
name="${name:-Carbon Stealth VCC}"
read -rsp 'Временна парола (сменя се при първия вход): ' password && echo
read -rsp 'Повтори паролата: ' again && echo
[ -n "$password" ] || fail "празна парола."
[ "$password" = "$again" ] || fail "паролите не съвпадат."

# Here-string, не echo/printf в конвейер: стойността не минава през команда, която печата.
docker compose exec -T -e OWNER_EMAIL="$email" -e OWNER_NAME="$name" app sh -c \
  'IFS= read -r OWNER_PASSWORD && export OWNER_PASSWORD && exec node dist/scripts/create-owner.js' <<<"$password"
unset password again
printf '\033[32m✔ fakturist: готово — влез на https://%s/vhod, смени паролата и включи 2FA.\033[0m\n' \
  "${FAKTURIST_DOMAIN:-fakturist.carbonstealth.eu}"
