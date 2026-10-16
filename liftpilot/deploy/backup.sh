#!/usr/bin/env bash
# LiftPilot's database copied every night, and every copy deleted after BACKUP_DAYS — the nightly ones and those
# deploy/deploy.sh makes before a migration — so that what is deleted from the database is gone from the copies within
# that time (BACKUP_DAYS in src/lib/legal.ts: the privacy notice states it). Installed by deploy/deploy.sh as
# /usr/local/sbin/liftpilot-backup and run by /etc/cron.d/liftpilot-backup; finds the database container by its
# Compose labels, so it does not depend on the release directory. A failed copy leaves no file.
# A failure is loud: the reason goes to the system log (`journalctl -t liftpilot-backup`) as well as to cron's stderr,
# and the exit status is not zero. A copy made pings LIFTPILOT_BACKUP_HEARTBEAT_URL when it is set (in the environment
# or in the server's secrets file, LIFTPILOT_ENV): a monitor that hears no ping for a day raises the alarm, which also
# covers a cron that never ran. A ping that fails is logged and never fails the copy.
set -euo pipefail
umask 077

BACKUPS="${LIFTPILOT_BACKUPS:-/opt/few-few/shared/liftpilot/backups}"
PANEL_DUMPS="${LIFTPILOT_PANEL_DUMPS:-/opt/few-few/shared/db-dumps}"
ENV_FILE="${LIFTPILOT_ENV:-/opt/few-few/shared/liftpilot/.env}"
BACKUP_DAYS=30
status=0

note() { logger -t liftpilot-backup -p "user.$1" -- "$2" 2>/dev/null || true; }
fail() { echo "liftpilot-backup: $1" >&2; note err "$1"; status=1; }

# the heartbeat's address: the environment first, else the secrets file (read as text, never sourced; a value written
# in single quotes by deploy.sh loses them); only http(s)
heartbeat="${LIFTPILOT_BACKUP_HEARTBEAT_URL:-}"
if [ -z "$heartbeat" ] && [ -r "$ENV_FILE" ]; then
  heartbeat="$(grep -E '^LIFTPILOT_BACKUP_HEARTBEAT_URL=' "$ENV_FILE" | head -n 1 | cut -d= -f2- || true)"
  heartbeat="${heartbeat#\'}"; heartbeat="${heartbeat%\'}"
fi
case "$heartbeat" in
  '' | https://* | http://*) ;;
  *) fail "LIFTPILOT_BACKUP_HEARTBEAT_URL is not an http(s) address: no ping"; heartbeat="" ;;
esac

install -d -m 700 "$BACKUPS"
db="$(docker ps -q --filter label=com.docker.compose.project=liftpilot --filter label=com.docker.compose.service=db | head -n 1 || true)"
if [ -n "$db" ]; then
  out="$BACKUPS/nightly-$(date -u +%Y%m%d).sql.gz"
  if docker exec "$db" pg_dump -U liftpilot liftpilot | gzip > "$out.part"; then
    mv "$out.part" "$out"
  else
    rm -f "$out.part"
    fail "pg_dump failed: no copy tonight ($out)"
  fi
else
  fail "the database container is not running: no copy tonight"
fi

# none older than BACKUP_DAYS, whatever made it: -mtime +N takes the copies of at least N+1 whole days, and a copy made
# by last month's run at this minute may be seconds short of its whole days tonight, so N = BACKUP_DAYS - 2 deletes
# every copy by the night it reaches BACKUP_DAYS days
if ! find "$BACKUPS" -maxdepth 1 -type f -name '*.sql.gz' -mtime +"$((BACKUP_DAYS - 2))" -delete; then
  fail "copies older than $BACKUP_DAYS days not deleted (find failed)"
fi
# the same for the copies of this database that the VPS dashboard's nightly snapshot makes of every Postgres container
# (vpsdash/src/backups.js: <database>-<time>.sql.gz in its dump directory, deleted only after 30 whole days there)
if [ -d "$PANEL_DUMPS" ] && ! find "$PANEL_DUMPS" -maxdepth 1 -type f -name 'liftpilot-*.sql.gz' -mtime +"$((BACKUP_DAYS - 2))" -delete; then
  fail "the dashboard's copies older than $BACKUP_DAYS days not deleted (find failed in $PANEL_DUMPS)"
fi

if [ "$status" = "0" ]; then
  note info "copy made: $out"
  if [ -n "$heartbeat" ] && ! curl -fsS -m 10 -o /dev/null "$heartbeat" 2>/dev/null; then
    note warning "copy made, but the heartbeat did not answer"
  fi
fi
exit "$status"
