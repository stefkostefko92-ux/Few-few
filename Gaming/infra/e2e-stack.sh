#!/usr/bin/env bash
# Bring up the full stack for the Playwright room-flow e2e (apps/web/e2e).
#
#   ./infra/e2e-stack.sh up     # start postgres+redis, push schema, run api/realtime/web
#   ./infra/e2e-stack.sh down   # stop the dev services + infra
#
# Then, in another shell:  pnpm --filter @aso/web e2e
#
# Requires a .env at the repo root (copy .env.example). Postgres/Redis come from
# the bundled docker compose; the three app processes run via `pnpm dev`.
set -euo pipefail
cd "$(dirname "$0")/.."

PIDFILE=.e2e-pids

up() {
  docker compose -f infra/docker-compose.yml up -d postgres redis
  echo "waiting for postgres…"; sleep 4
  pnpm --filter @aso/db generate
  pnpm --filter @aso/db exec prisma db push --skip-generate
  set -a; . ./.env; set +a
  pnpm --filter @aso/api dev   >/tmp/aso-api.log      2>&1 & echo $! >  "$PIDFILE"
  pnpm --filter @aso/realtime dev >/tmp/aso-realtime.log 2>&1 & echo $! >> "$PIDFILE"
  pnpm --filter @aso/web exec vite --port 4502 --strictPort >/tmp/aso-web.log 2>&1 & echo $! >> "$PIDFILE"
  echo "stack up (api:4500 realtime:4501 web:4502). Logs in /tmp/aso-*.log"
  echo "run:  pnpm --filter @aso/web e2e"
}

down() {
  [ -f "$PIDFILE" ] && xargs kill < "$PIDFILE" 2>/dev/null || true
  rm -f "$PIDFILE"
  docker compose -f infra/docker-compose.yml stop postgres redis || true
  echo "stack down"
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  *) echo "usage: $0 [up|down]"; exit 1 ;;
esac
