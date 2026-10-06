#!/usr/bin/env bash
# LiftPilot's database copied every night, and every copy deleted after BACKUP_DAYS — the nightly ones and those
# deploy/deploy.sh makes before a migration — so that what is deleted from the database is gone from the copies within
# that time (BACKUP_DAYS in src/lib/legal.ts: the privacy notice states it). Installed by deploy/deploy.sh as
# /usr/local/sbin/liftpilot-backup and run by /etc/cron.d/liftpilot-backup; finds the database container by its
# Compose labels, so it does not depend on the release directory. A failed copy leaves no file.
set -euo pipefail
umask 077

BACKUPS="${LIFTPILOT_BACKUPS:-/opt/few-few/shared/liftpilot/backups}"
BACKUP_DAYS=30
status=0

install -d -m 700 "$BACKUPS"
db="$(docker ps -q --filter label=com.docker.compose.project=liftpilot --filter label=com.docker.compose.service=db | head -n 1)"
if [ -n "$db" ]; then
  out="$BACKUPS/nightly-$(date -u +%Y%m%d).sql.gz"
  if docker exec "$db" pg_dump -U liftpilot liftpilot | gzip > "$out.part"; then
    mv "$out.part" "$out"
  else
    rm -f "$out.part"
    echo "liftpilot-backup: pg_dump failed" >&2
    status=1
  fi
else
  echo "liftpilot-backup: the database container is not running" >&2
  status=1
fi

# older than BACKUP_DAYS, whatever made it: -mtime +N means at least N+1 whole days
find "$BACKUPS" -maxdepth 1 -type f -name '*.sql.gz' -mtime +"$((BACKUP_DAYS - 1))" -delete
exit "$status"
