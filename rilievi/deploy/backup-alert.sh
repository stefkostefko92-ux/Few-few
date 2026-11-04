#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/backup-alert.sh — дневният бекъп се провали (rilievi-backup-alert.service, OnFailure).
#
# Критичен ред в журнала, файл ULTIMO_ERRORE до ULTIMO_OK (вижда се от таблото и на ръка) и — ако е
# зададен — сигнал до RILIEVI_ALERT_URL в $SHARED/backup.env (ntfy, Uptime Kuma, Healthchecks /fail).
# Пропуснат ден без провал (таймерът не е тръгнал) хваща RILIEVI_HEARTBEAT_URL от самия бекъп.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SHARED="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}"
if [ -f "$SHARED/backup.env" ]; then
  # shellcheck disable=SC1091
  set -a && . "$SHARED/backup.env" && set +a
fi
install -d -m 700 "$SHARED/backups"
date -u +%FT%TZ >"$SHARED/backups/ULTIMO_ERRORE"
logger -p daemon.crit -t rilievi-backup "дневният бекъп на Rilievi Impianti се провали — journalctl -u rilievi-backup" 2>/dev/null || true
if [ -n "${RILIEVI_ALERT_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null -d "rilievi-backup: il backup giornaliero non è riuscito" \
    "$RILIEVI_ALERT_URL" || true
fi
