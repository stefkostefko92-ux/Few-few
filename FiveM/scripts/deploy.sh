#!/usr/bin/env bash
# Деплой на FiveM Bulgaria — идемпотентен, викан от `deploy/autodeploy.sh` или
# на ръка от папката на продукта.
#
#   ./scripts/deploy.sh              # нормално
#   ./scripts/deploy.sh --discover   # и първоначално напълване от Cfx.re
#
# Редът НЕ е произволен:
#   бекъп → вдигане → изчакване на базата → миграции → (по избор) откриване.
# Бекъпът е ПРЕДИ миграцията, защото след нея е закъснял; миграциите ни са
# адитивни, но това е дисциплина, не късмет.
set -euo pipefail
cd "$(dirname "$0")/.."

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

DISCOVER=0
[ "${1:-}" = "--discover" ] && DISCOVER=1

[ -f .env ] || die "Няма FiveM/.env — тайните живеят на сървъра (виж DEPLOY.md)."
chmod 600 .env

if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else die "Липсва Docker Compose."; fi

# ── 1) Бекъп ПРЕДИ да пипаме каквото и да е ─────────────────────────────────
# `backups/` е симлинк към стабилен път извън releases (слага го autodeploy) —
# иначе историята умира с прочистването на старите releases.
mkdir -p backups
if $DC ps db 2>/dev/null | grep -qiE 'up|running|healthy'; then
  BK="backups/pre-deploy-$(date +%Y%m%d-%H%M%S).sql.gz"
  if $DC exec -T db pg_dump -U fivem fivem | gzip > "$BK"; then
    # Нулев бекъп е по-опасен от липсващ: изглежда като защита, а не е.
    [ -s "$BK" ] || { rm -f "$BK"; die "Бекъпът излезе празен — спирам преди миграцията."; }
    ok "Бекъп: $BK ($(du -h "$BK" | cut -f1))"
  else
    rm -f "$BK"
    die "pg_dump се провали — спирам преди миграцията."
  fi
else
  warn "Базата не върви (пръв деплой?) — няма какво да се бекъпва."
fi

# ── 2) Вдигане ──────────────────────────────────────────────────────────────
log "Строя и вдигам стека…"
$DC up -d --build

# ── 3) Изчакай базата, после мигрирай ───────────────────────────────────────
log "Чакам базата…"
for i in $(seq 1 30); do
  $DC exec -T db pg_isready -U fivem >/dev/null 2>&1 && break
  [ "$i" = "30" ] && die "Базата не се вдигна за 60 s."
  sleep 2
done
ok "Базата отговаря."

log "Пускам миграциите…"
$DC exec -T web npx prisma migrate deploy

# ── 4) Първоначално напълване ───────────────────────────────────────────────
# Директория, която стартира празна, не пробива пазара. Пуска се САМО при празна
# таблица (или с --discover): при повторен деплой откриването е работа на cron-а.
COUNT="$($DC exec -T db psql -U fivem -d fivem -tAc 'SELECT count(*) FROM "Server"' 2>/dev/null | tr -dc '0-9' || echo 0)"
if [ "$DISCOVER" = "1" ] || [ "${COUNT:-0}" = "0" ]; then
  log "Пълня директорията от публичния списък на Cfx.re (снапшотът е ~19 MB)…"
  $DC exec -T web npx tsx scripts/discover-servers.ts || warn "Откриването не мина — cron-ът ще опита пак след 45 мин."
else
  ok "В базата има $COUNT сървъра — пропускам първоначалното напълване."
fi

ok "FiveM е разгърнат. Здравна проба: wget -qO- http://127.0.0.1:3010/api/health"
