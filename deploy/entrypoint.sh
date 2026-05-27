#!/bin/sh
set -e

# Seed the database on first boot.
DB="${DB_PATH:-/app/data/tanoth.db}"
if [ ! -f "$DB" ]; then
  echo "[tanoth] Seeding fresh database at $DB"
  node /app/server/dist/seed/run.js
fi

exec "$@"
