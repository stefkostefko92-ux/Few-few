#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Изолиран стек за браузърните тестове на игрите (apps/web/e2e/games).
#
#     bash infra/e2e-games.sh up   <N>    # N = 0..9 — отделни портове, база и Redis
#     bash infra/e2e-games.sh down <N>
#     bash infra/e2e-games.sh env  <N>    # печата E2E_BASE_URL за Playwright
#
#  N=0 → api :4500, realtime :4501, web :4502 (портовете по подразбиране);
#  N≥1 → api :46N0, realtime :46N1, web :46N2. Няколко стека вървят едновременно,
#  без да си пречат: всеки има своя база `aso_e2e_N` и свой Redis номер N
#  (опашките за мачове живеят в Redis). Postgres и Redis се вдигат веднъж като
#  контейнери (aso-e2e-pg на :5437, aso-e2e-redis на :6383).
#
#  Тръгва от ВЕЧЕ билднатия код (dist/) — след промяна:
#     env -u NODE_ENV pnpm turbo run build --filter=@aso/api --filter=@aso/realtime --filter=@aso/web
#  и пак `up N` (up спира стария стек на същия N).
#
#  Тайните тук са тестови и важат само за локалния стек.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

cmd="${1:-up}"
N="${2:-0}"
case "$N" in [0-9]) ;; *) echo "N трябва да е 0..9" >&2; exit 2 ;; esac

if [ "$N" = "0" ]; then API=4500; RT=4501; WEB=4502; else API="46${N}0"; RT="46${N}1"; WEB="46${N}2"; fi
STATE_DIR="${TMPDIR:-/tmp}/aso-e2e-$N"
DB="aso_e2e_$N"
DB_URL="postgresql://aso:aso@localhost:5437/${DB}?schema=public"
BASE="http://127.0.0.1:${WEB}/app/"

infra() {
  command -v docker >/dev/null || { echo "docker липсва" >&2; exit 1; }
  docker inspect aso-e2e-pg >/dev/null 2>&1 || docker run -d --name aso-e2e-pg \
    -e POSTGRES_USER=aso -e POSTGRES_PASSWORD=aso -e POSTGRES_DB=aso \
    -p 127.0.0.1:5437:5432 postgres:16-alpine >/dev/null
  docker inspect aso-e2e-redis >/dev/null 2>&1 || docker run -d --name aso-e2e-redis \
    -p 127.0.0.1:6383:6379 redis:7-alpine >/dev/null
  docker start aso-e2e-pg aso-e2e-redis >/dev/null
  for _ in $(seq 1 30); do docker exec aso-e2e-pg pg_isready -U aso >/dev/null 2>&1 && break; sleep 1; done
  docker exec aso-e2e-pg psql -U aso -d aso -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1 \
    || docker exec aso-e2e-pg psql -U aso -d aso -c "CREATE DATABASE ${DB}" >/dev/null
}

stop() {
  if [ -f "$STATE_DIR/pids" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$STATE_DIR/pids"
    rm -f "$STATE_DIR/pids"
  fi
  # Сирачета от предишен пуск, които още държат портовете.
  for port in "$API" "$RT" "$WEB"; do
    command -v fuser >/dev/null && fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  done
}

common_env() {
  export NODE_ENV=development
  export DATABASE_URL="$DB_URL"
  export REDIS_URL="redis://localhost:6383/${N}"
  export JWT_SECRET="e2e-access-secret-${N}-0123456789abcdef0123456789"
  export JWT_REFRESH_SECRET="e2e-refresh-secret-${N}-0123456789abcdef012345678"
  export INTERNAL_API_SECRET="e2e-internal-secret-${N}-0123456789"
  export CORS_ORIGINS="http://127.0.0.1:${WEB},http://localhost:${WEB}"
  export PUBLIC_WEB_URL="http://127.0.0.1:${WEB}"
  export PUBLIC_API_URL="http://127.0.0.1:${API}"
  export WEB_BASE_PATH="/app"
  export API_PORT="$API" REALTIME_PORT="$RT"
  export API_INTERNAL_URL="http://127.0.0.1:${API}"
  export REALTIME_INTERNAL_URL="http://127.0.0.1:${RT}"
  # Ботът влиза бързо, за да не чака всеки тест опонент.
  export BOT_FALLBACK_SECONDS="${BOT_FALLBACK_SECONDS:-2}"
  export DISCONNECT_GRACE_SECONDS="${DISCONNECT_GRACE_SECONDS:-45}"
  # Фиксирани раздавания (apps/realtime/src/e2eSeeds.ts) за игрите, чиито тестове
  # трябва да стигнат до всяко действие — сценарият на всеки seed е описан в
  # spec-а (Реми: първият ход позволява отваряне със смяна на жокер; Табла: пул
  # на бара и 6-6 срещу затворено поле → „Няма възможен ход“). В продукция
  # realtime ги игнорира. `E2E_SEEDS= bash … up N` = напълно случайни раздавания.
  export E2E_SEEDS="${E2E_SEEDS-SANTASE=e2e-santase-5159,BELOTE=e2e-belote-36,BRIDGE=e2e-bridge-110,KENT=e2e-kent-411,RUMMY=e2e-rummy-69,BACKGAMMON=e2e-backgammon-111}"
}

up() {
  stop
  infra
  mkdir -p "$STATE_DIR"
  common_env
  pnpm --filter @aso/db exec prisma migrate deploy >"$STATE_DIR/migrate.log" 2>&1 \
    || { cat "$STATE_DIR/migrate.log" >&2; exit 1; }
  (cd apps/api && exec node dist/index.js) >"$STATE_DIR/api.log" 2>&1 & echo $! > "$STATE_DIR/pids"
  (cd apps/realtime && exec node dist/index.js) >"$STATE_DIR/realtime.log" 2>&1 & echo $! >> "$STATE_DIR/pids"
  # NODE_ENV=production: vite.config избира base /app/ по него — билдът е под /app/.
  (cd apps/web && NODE_ENV=production E2E_API_TARGET="http://127.0.0.1:${API}" E2E_RT_TARGET="http://127.0.0.1:${RT}" \
    exec npx vite preview --port "$WEB" --host 127.0.0.1 --strictPort) >"$STATE_DIR/web.log" 2>&1 & echo $! >> "$STATE_DIR/pids"
  for _ in $(seq 1 60); do
    a=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${API}/health" || true)
    w=$(curl -s -o /dev/null -w '%{http_code}' "$BASE" || true)
    r=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${RT}/socket.io/?EIO=4&transport=polling" || true)
    [ "$a" = 200 ] && [ "$w" = 200 ] && [ "$r" = 200 ] && { echo "stack $N up → E2E_BASE_URL=$BASE (logs: $STATE_DIR)"; return 0; }
    sleep 1
  done
  echo "stack $N не тръгна — виж $STATE_DIR/*.log" >&2
  tail -n 20 "$STATE_DIR"/api.log "$STATE_DIR"/realtime.log "$STATE_DIR"/web.log >&2 || true
  exit 1
}

case "$cmd" in
  up) up ;;
  down) stop; echo "stack $N down" ;;
  env) echo "E2E_BASE_URL=$BASE" ;;
  *) echo "usage: $0 up|down|env <N>" >&2; exit 2 ;;
esac
