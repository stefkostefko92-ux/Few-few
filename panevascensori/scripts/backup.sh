#!/usr/bin/env bash
# ============================================================
#  PANEV ASCENSORI — Daily DB Backup
#  Target: /var/backups/panev/panev-YYYY-MM-DD.db.gz
#  Retention: keep last 30 days + weekly (sunday) for 12 weeks
#
#  Automatically installed by bootstrap-vps.sh as daily cron at 03:15.
#  Manual run:  bash scripts/backup.sh
# ============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${DB_PATH:-$APP_DIR/data/panev.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/panev}"
RETENTION_DAILY=30    # days
RETENTION_WEEKLY=12   # weeks

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

DATE=$(date -u +"%Y-%m-%d")
DOW=$(date -u +"%u")    # 1=Mon .. 7=Sun
SNAPSHOT="$BACKUP_DIR/panev-$DATE.db"
ARCHIVE="$SNAPSHOT.gz"

if [[ ! -f "$DB_PATH" ]]; then
  echo "[backup] DB non trovato: $DB_PATH" >&2
  exit 1
fi

# Atomic snapshot using SQLite VACUUM INTO (hot backup, safe during writes).
# Prefer system sqlite3 CLI; fall back to Node.js (better-sqlite3) if missing.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" "VACUUM INTO '$SNAPSHOT'"
else
  node -e "
    const db = require('$APP_DIR/node_modules/better-sqlite3')('$DB_PATH', { readonly: true });
    db.exec(\"VACUUM INTO '\" + '$SNAPSHOT' + \"'\");
    db.close();
  " 2>/dev/null || {
    echo "[backup] Né sqlite3 CLI né better-sqlite3 disponibili" >&2
    exit 1
  }
fi
gzip -f "$SNAPSHOT"
chmod 600 "$ARCHIVE"

SIZE=$(du -h "$ARCHIVE" | cut -f1)
echo "[backup] ✓ $ARCHIVE ($SIZE)"

# Tag as weekly snapshot if it's Sunday
if [[ "$DOW" == "7" ]]; then
  cp "$ARCHIVE" "$BACKUP_DIR/weekly-$DATE.db.gz"
  echo "[backup] ✓ Weekly snapshot: weekly-$DATE.db.gz"
fi

# Retention — daily backups older than N days
find "$BACKUP_DIR" -maxdepth 1 -name "panev-*.db.gz" -mtime +$RETENTION_DAILY -delete 2>/dev/null || true

# Retention — weekly backups older than N*7 days
find "$BACKUP_DIR" -maxdepth 1 -name "weekly-*.db.gz" -mtime +$((RETENTION_WEEKLY * 7)) -delete 2>/dev/null || true

# Report
DAILY_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name "panev-*.db.gz" | wc -l)
WEEKLY_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name "weekly-*.db.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "[backup] State: $DAILY_COUNT daily + $WEEKLY_COUNT weekly snapshots ($TOTAL_SIZE total)"
