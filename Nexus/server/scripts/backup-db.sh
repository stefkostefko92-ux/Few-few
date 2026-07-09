#!/bin/bash
# Daily SQLite backup. Writes a hot copy of the live DB into a dated
# tarball, keeps the last 14 days, and trims everything older.
#
# Usage from the VPS crontab (runs at 03:15 every night):
#   15 3 * * * /opt/nexus/server/scripts/backup-db.sh >> /var/log/nexus-backup.log 2>&1
#
# SQLite's built-in `.backup` produces a consistent snapshot even while
# the live process is writing — no app downtime required.

set -e

DB="${DB_PATH:-/opt/nexus/data/nexus-dominion.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/nexus/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
ts=$(date +%Y%m%d-%H%M%S)
out="$BACKUP_DIR/nexus-dominion-$ts.db"

if [ ! -f "$DB" ]; then
  echo "[backup] DB not found at $DB" >&2
  exit 1
fi

# Use SQLite's online backup API via the CLI for consistency.
sqlite3 "$DB" ".backup '$out'"
gzip -9 "$out"
echo "[backup] wrote $out.gz ($(stat -c%s "$out.gz") bytes)"

# Trim old backups
find "$BACKUP_DIR" -name 'nexus-dominion-*.db.gz' -mtime "+$KEEP_DAYS" -delete -print | \
  sed 's/^/[backup] pruned: /'
