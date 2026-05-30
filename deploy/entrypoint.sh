#!/bin/sh
set -e

DB="${DB_PATH:-/app/data/nexus-dominion.db}"

# Seed on first boot, and re-seed on every boot if RESEED_ON_BOOT=1.
# The seed uses INSERT OR REPLACE / OR IGNORE, so it's idempotent and won't
# wipe user characters.
if [ ! -f "$DB" ] || [ "${RESEED_ON_BOOT:-1}" = "1" ]; then
  echo "[nexus-dominion] Running seed against $DB"
  node /app/server/dist/seed/run.js
fi

exec "$@"
