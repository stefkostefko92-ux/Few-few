#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/monitoring/audit-verify.sh — дневната проверка на одитната верига (FR-12, §15.1):
# `node dist/cli/audit-verify.js` в работещия контейнер на приложението, резултатът — като метрика за
# textfile collector-а на node-exporter (docker-compose.monitoring.yml) → аларма ChatchatAuditChainBroken.
#
#   sudo chatchat-audit-verify     # /usr/local/sbin/chatchat-audit-verify; таймерът — всеки ден в 04:07 UTC
#
# Слага го deploy/monitoring.sh. Два файла в $SHARED/monitoring/textfile (644 — метриките не са тайна):
#   chatchat_audit_chain.prom   — само след ЗАВЪРШЕНА проверка (цяла/счупена) + часът ѝ;
#   chatchat_audit_verify.prom  — всеки опит: час и дали е завършил.
# Незавършена проверка (няма контейнер, базата не отговаря) не пипа присъдата — след 50 ч без завършена
# проверка гори ChatchatAuditVerifyStale. Изход: 0 цяла · 2 счупена · 1 не завърши.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="${CHATCHAT_COMPOSE_PROJECT:-chatchat}"
SHARED="${CHATCHAT_SHARED:-/opt/few-few/shared/chatchat}"
TEXTFILE_DIR="${CHATCHAT_TEXTFILE_DIR:-$SHARED/monitoring/textfile}"

say() { printf 'chatchat-audit-verify: %s\n' "$*" >&2; }

# Атомарно: node-exporter никога не чете половин файл (временният е в същата папка, после rename).
write_prom() {
  local name="$1" tmp
  shift
  install -d -m 755 "$TEXTFILE_DIR"
  tmp="$(mktemp "$TEXTFILE_DIR/.$name.XXXXXX")"
  printf '%s\n' "$@" >"$tmp"
  chmod 644 "$tmp"
  mv -f "$tmp" "$TEXTFILE_DIR/$name"
}

record_chain() {
  write_prom chatchat_audit_chain.prom \
    '# HELP chatchat_audit_chain_intact 1 = одитната верига е цяла при последната завършена проверка, 0 = счупена.' \
    '# TYPE chatchat_audit_chain_intact gauge' \
    "chatchat_audit_chain_intact $1" \
    '# HELP chatchat_audit_chain_verified_timestamp_seconds Кога е завършила последната проверка (Unix време).' \
    '# TYPE chatchat_audit_chain_verified_timestamp_seconds gauge' \
    "chatchat_audit_chain_verified_timestamp_seconds $2"
}

record_attempt() {
  write_prom chatchat_audit_verify.prom \
    '# HELP chatchat_audit_verify_last_run_timestamp_seconds Кога е последният опит за проверка (Unix време).' \
    '# TYPE chatchat_audit_verify_last_run_timestamp_seconds gauge' \
    "chatchat_audit_verify_last_run_timestamp_seconds $2" \
    '# HELP chatchat_audit_verify_last_run_success 1 = последният опит е завършил (с присъда), 0 = не е.' \
    '# TYPE chatchat_audit_verify_last_run_success gauge' \
    "chatchat_audit_verify_last_run_success $1"
}

audit_verify() {
  local ids rc=0 now
  [ "$(id -u)" = 0 ] || {
    say "пусни като root (sudo)."
    return 1
  }
  now="$(date +%s)"
  ids="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=app")" || ids=""
  if [ -z "$ids" ] || [ "$(printf '%s\n' "$ids" | wc -l)" != 1 ]; then
    say "няма (точно един) работещ контейнер на приложението (compose проект $PROJECT) — проверката НЕ е пусната."
    record_attempt 0 "$now"
    return 1
  fi
  docker exec "$ids" node dist/cli/audit-verify.js || rc=$?
  now="$(date +%s)"
  case "$rc" in
    0)
      record_chain 1 "$now"
      record_attempt 1 "$now"
      ;;
    2)
      record_chain 0 "$now"
      record_attempt 1 "$now"
      say "ВЕРИГАТА Е СЧУПЕНА — docs/runbook.md, ChatchatAuditChainBroken."
      ;;
    *)
      record_attempt 0 "$now"
      say "проверката не завърши (изход $rc) — journalctl -u chatchat-audit-verify."
      rc=1
      ;;
  esac
  return "$rc"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then audit_verify; fi
