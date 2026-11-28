#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fakturist/deploy/backup-alert.sh — дневният бекъп се провали (fakturist-backup-alert.service, OnFailure).
#
# Критичен ред в журнала, файл LAST_ERROR до LAST_OK (вижда се на ръка и от мониторинга) и — ако е
# зададен — сигнал до FAKTURIST_ALERT_URL в $SHARED/backup.env (ntfy, Uptime Kuma, Healthchecks /fail).
# Пропуснат ден без провал (таймерът не е тръгнал) хваща FAKTURIST_HEARTBEAT_URL от самия бекъп.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${FAKTURIST_SHARED:-/opt/few-few/shared/fakturist}"
if [ -f "$SHARED/backup.env" ]; then
  # shellcheck disable=SC1091
  set -a && . "$SHARED/backup.env" && set +a
fi
install -d -m 700 "$SHARED/backups"
date -u +%FT%TZ >"$SHARED/backups/LAST_ERROR"
logger -p daemon.crit -t fakturist-backup "дневният бекъп на Фактурист се провали — journalctl -u fakturist-backup" 2>/dev/null || true
if [ -n "${FAKTURIST_ALERT_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null -d "fakturist-backup: дневният бекъп на Фактурист се провали" \
    "$FAKTURIST_ALERT_URL" || true
fi
