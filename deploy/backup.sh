#!/bin/sh
# Tanoth-Reborn — SQLite hot backup.
#
# Usage:
#   deploy/backup.sh                     # writes to ./backups/tanoth-YYYYMMDD-HHMMSS.db
#   deploy/backup.sh /path/to/out.db     # writes to a specific file
#
# When the app runs in Docker, run this inside the container, e.g.:
#   docker compose exec tanoth /app/deploy/backup.sh
#
# Or on the host (with the volume mounted), point DB_PATH to the file.

set -e

DB_PATH="${DB_PATH:-/app/data/tanoth.db}"
if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: database not found at $DB_PATH" >&2
  exit 1
fi

OUT="${1:-}"
if [ -z "$OUT" ]; then
  mkdir -p backups
  TS=$(date +%Y%m%d-%H%M%S)
  OUT="backups/tanoth-$TS.db"
fi

# Use sqlite3's online backup (consistent even with WAL writers)
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$OUT'"
else
  # Fallback: simple cp (WAL must be checkpointed; rely on best-effort)
  cp "$DB_PATH" "$OUT"
fi

echo "Backup written: $OUT"
echo "Size: $(du -h "$OUT" | cut -f1)"
