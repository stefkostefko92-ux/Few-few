#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/backup-alert.sh — дневният бекъп се провали (rilievi-backup-alert.service, OnFailure).
#
# Критичен ред в журнала, файл ULTIMO_ERRORE до ULTIMO_OK (вижда се от таблото и на ръка) и аларма до
# RILIEVI_ALERT_URL в $SHARED/backup.env (deploy/alert.sh — Discord webhook или друг адрес). backup.sh праща
# своята аларма с причината сам и оставя маркера .allarme-inviato — тогава тук втора не тръгва; без маркер
# (скриптът е убит: таймаут, OOM, kill — изходът му не е стигнат) тръгва тази.
# Пропуснат ден без провал (таймерът не е тръгнал) хваща RILIEVI_HEARTBEAT_URL от самия бекъп; мъртъв
# сървър — само външен монитор на /health (DEPLOY.md, „Аларми в Discord“).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SHARED="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}"
if [ -f "$SHARED/backup.env" ]; then
  # shellcheck disable=SC1091
  set -a && . "$SHARED/backup.env" && set +a
fi
# shellcheck source=alert.sh
if [ -f "$(dirname "${BASH_SOURCE[0]}")/alert.sh" ]; then
  . "$(dirname "${BASH_SOURCE[0]}")/alert.sh"
else
  alert_fallito() { echo "rilievi-backup: alert non inviato (manca deploy/alert.sh)" >&2; }
fi
SENT="$SHARED/backups/.allarme-inviato"

install -d -m 700 "$SHARED/backups"
date -u +%FT%TZ >"$SHARED/backups/ULTIMO_ERRORE"
logger -p daemon.crit -t rilievi-backup "дневният бекъп на Rilievi Impianti се провали — journalctl -u rilievi-backup" 2>/dev/null || true
if [ -f "$SENT" ]; then
  rm -f "$SENT"
  echo "rilievi-backup: алармата с причината вече е пратена от backup.sh"
else
  alert_fallito backup "interrotto prima della fine (timeout o kill), vedi journalctl -u rilievi-backup"
fi
