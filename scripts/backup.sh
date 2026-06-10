#!/bin/bash
set -e
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
docker compose exec -T postgres pg_dump -U erp_admin -d erp_ascensori --no-owner --clean --if-exists | gzip > "$BACKUP_DIR/erp_${TIMESTAMP}.sql.gz"
ls -t "$BACKUP_DIR"/erp_*.sql.gz | tail -n +31 | xargs -r rm -v
echo "Backup: $BACKUP_DIR/erp_${TIMESTAMP}.sql.gz"
