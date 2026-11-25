#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/create-master.sh — първият MASTER, веднъж след първия деплой (DEPLOY.md, т. 4).
# Всички останали влизат САМО с покана от портала (Utenti → Invita utente).
#
#   sudo bash /opt/few-few/current/rilievi/deploy/create-master.sh
#
# Паролата се въвежда скрито и стига до контейнера през stdin (here-string на bash): не остава
# в историята на шела и не е в командния ред на docker (`ps`, /proc/<pid>/cmdline). Минава същата
# проверка като всички: поне 12 знака, без части от имейла или името.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SHARED="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}"

fail() { printf '\033[31m✘ rilievi: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || fail "пусни като root (sudo)."
app="$(head -n 1 "$SHARED/last-good" 2>/dev/null || true)"
[ -n "$app" ] && [ -f "$app/docker-compose.yml" ] || fail "няма работещ release ($SHARED/last-good) — първо деплой (DEPLOY.md, т. 3)."
cd "$app"

read -rp 'Имейл [admin@carbonstealth.eu]: ' email
email="${email:-admin@carbonstealth.eu}"
read -rp 'Име [Carbon Stealth VCC]: ' name
name="${name:-Carbon Stealth VCC}"
read -rsp 'Парола (поне 12 знака): ' password && echo
read -rsp 'Повтори паролата: ' again && echo
[ "$password" = "$again" ] || fail "паролите не съвпадат."

# Here-string, не echo/printf в конвейер: стойността не минава през команда, която печата.
docker compose exec -T -e OWNER_EMAIL="$email" -e OWNER_NAME="$name" app sh -c \
  'IFS= read -r OWNER_PASSWORD && export OWNER_PASSWORD && exec node dist/scripts/create-owner.js' <<<"$password"
unset password again
printf '\033[32m✔ rilievi: MASTER е създаден — влез в портала и покани екипа от „Utenti“.\033[0m\n'
