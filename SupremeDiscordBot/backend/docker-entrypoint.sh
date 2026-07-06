#!/bin/sh
set -e

echo "[entrypoint] Waiting for postgres..."

# Probe postgres by trying a trivial prisma query. Retry up to ~60s.
MAX_TRIES=30
TRIES=0
while true; do
  if node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\$queryRaw\`SELECT 1\`.then(() => p.\$disconnect()).then(() => process.exit(0)).catch(() => process.exit(1));
  " 2>/dev/null; then
    break
  fi
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge $MAX_TRIES ]; then
    echo "[entrypoint] ERROR: Postgres did not become reachable in ~60s"
    exit 1
  fi
  sleep 2
done
echo "[entrypoint] ✓ Postgres reachable"

echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting server..."
exec "$@"
