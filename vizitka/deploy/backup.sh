#!/usr/bin/env bash
# Криптиран бекъп на Vizitka: SQLite базата + качените снимки (data/uploads).
# Използва онлайн backup на SQLite (консистентно копие дори при работещо
# приложение — включва WAL) и age за криптиране. Възстановяването изисква
# частния age ключ, който НЕ живее на този сървър.
#
# Cron (дневно в 3:25):
#   25 3 * * * AGE_RECIPIENT=age1... /opt/vizitka/deploy/backup.sh >> /var/log/vizitka-backup.log 2>&1

set -euo pipefail

DATA_DIR="${DATA_DIR:-/opt/vizitka/data}"
DB="${DB_PATH:-$DATA_DIR/vizitka.db}"
UPLOADS="${UPLOADS_DIR:-$DATA_DIR/uploads}"
DEST="${BACKUP_DIR:-/var/backups/vizitka}"
AGE_RECIPIENT="${AGE_RECIPIENT:?Задайте AGE_RECIPIENT (публичен age ключ)}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Консистентно копие на базата (включва WAL).
sqlite3 "$DB" ".backup '$TMP/vizitka.db'"

# Снимките (профилни, корици, банери). Ако още няма качени файлове — празен архив.
tar -czf "$TMP/uploads.tar.gz" -C "$DATA_DIR" "$(basename "$UPLOADS")" 2>/dev/null \
  || tar -czf "$TMP/uploads.tar.gz" -C "$TMP" --files-from /dev/null

# Едно криптирано парче: база + снимки заедно (консистентни във времето).
tar -czf "$TMP/vizitka-$STAMP.tar.gz" -C "$TMP" vizitka.db uploads.tar.gz

# Криптиране към получателя (само притежателят на частния ключ може да възстанови).
age -r "$AGE_RECIPIENT" -o "$DEST/vizitka-$STAMP.tar.gz.age" "$TMP/vizitka-$STAMP.tar.gz"

# Чистене на стари бекъпи.
find "$DEST" -name 'vizitka-*.tar.gz.age' -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -Is)] Бекъп готов: $DEST/vizitka-$STAMP.tar.gz.age"
