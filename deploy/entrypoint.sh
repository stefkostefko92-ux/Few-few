#!/bin/sh
set -e

DB="${DB_PATH:-/app/data/nexus-dominion.db}"

# Audit (deploy round): default RESEED_ON_BOOT=0 — re-seeding on every
# container restart was clobbering admin-edited item tuning (the seed
# uses INSERT OR REPLACE on the items table). First-boot seed still
# fires automatically when the DB file is absent. Opt in with
# RESEED_ON_BOOT=1 from compose to force a re-seed after a content
# update.
if [ ! -f "$DB" ] || [ "${RESEED_ON_BOOT:-0}" = "1" ]; then
  echo "[nexus-dominion] Running seed against $DB"
  node /app/server/dist/seed/run.js
fi

exec "$@"
