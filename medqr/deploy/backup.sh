#!/usr/bin/env bash
# Криптиран бекъп на SQLite базата на MedQR.
# Използва онлайн backup на SQLite (консистентен дори при работещо приложение)
# и age за криптиране. Възстановяването изисква частния age ключ.
#
# Cron (дневно в 3:15):
#   15 3 * * * /opt/medqr/deploy/backup.sh >> /var/log/medqr-backup.log 2>&1

set -euo pipefail

DB="${DB_PATH:-/opt/medqr/data/medqr.sqlite}"
DEST="${BACKUP_DIR:-/var/backups/medqr}"
AGE_RECIPIENT="${AGE_RECIPIENT:?Задайте AGE_RECIPIENT (публичен age ключ)}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Консистентно копие на базата (включва WAL).
sqlite3 "$DB" ".backup '$TMP/medqr.sqlite'"

# Криптиране към получателя (само притежателят на частния ключ може да възстанови).
age -r "$AGE_RECIPIENT" -o "$DEST/medqr-$STAMP.sqlite.age" "$TMP/medqr.sqlite"

# Чистене на стари бекъпи.
find "$DEST" -name 'medqr-*.sqlite.age' -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -Is)] Бекъп готов: $DEST/medqr-$STAMP.sqlite.age"
