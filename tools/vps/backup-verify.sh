#!/usr/bin/env bash
# backup-verify.sh — бекъп И проверено възстановяване (VPS-аджията v2.0).
# Бекъп без тестван restore не е бекъп. Прави restic snapshot и после възстановява
# в временна папка, за да докаже, че архивът е читаем.
#
# Подкоманди:
#   backup                       — pg_dump (zabobovdol) + data/ (medqr) → restic repo
#   verify [--before <ISO>]      — restic check + test-restore в temp + сверка (по подразбиране последния
#                                  snapshot; с --before — най-новия ПРЕДИ този момент)
#   restore --before <ISO> [--target <папка>]
#                                — след инцидент: възстановява най-новия snapshot ПРЕДИ момента в НОВА
#                                  папка (по подразбиране /var/backups/few-few-restore-<час>); живите
#                                  данни не се пипат — сравняваш и връщаш на ръка
#   prune      — изчисти стари snapshot-и по политика
#
#   <ISO> е всичко, което `date -d` чете: 2026-11-14T03:00:00Z, "2026-11-14 03:00 +0200".
#
# ВАЖНО: `restic check` доказва ЦЯЛОСТ (архивът е читаем и непокътнат), НЕ че данните в него
# са чисти. Снимка, направена след пробив, вярно пази и пробива — затова при инцидент избирай
# снимка отпреди първия признак (--before), не „последната здрава".
#
# Изисква: restic. ENV: RESTIC_REPOSITORY, RESTIC_PASSWORD (или _FILE). По избор
# S3/B2 backend за off-site. Тайните остават извън репото (mode 600).
set -euo pipefail
die(){ printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
ok(){  printf '\033[32m✔ %s\033[0m\n' "$*"; }
inf(){ printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
command -v restic >/dev/null || die "Липсва restic. apt-get install -y restic"
: "${RESTIC_REPOSITORY:?задай RESTIC_REPOSITORY}"

STAGE="${STAGE:-/var/backups/few-few}"; mkdir -p "$STAGE"

cmd_backup(){
  inf "Снимка на данните…"
  if command -v docker >/dev/null && docker compose -f "${ZBD_COMPOSE:-/opt/few-few/current/zabobovdol/docker-compose.yml}" ps >/dev/null 2>&1; then
    docker compose -f "${ZBD_COMPOSE:-/opt/few-few/current/zabobovdol/docker-compose.yml}" exec -T db \
      pg_dump -U "${POSTGRES_USER:-zbd}" "${POSTGRES_DB:-zbd}" > "$STAGE/zabobovdol.sql" && ok "pg_dump"
  fi
  [ -d "${MEDQR_DATA:-/opt/medqr/data}" ] && cp -a "${MEDQR_DATA:-/opt/medqr/data}" "$STAGE/medqr-data" && ok "medqr data/"
  restic backup "$STAGE" --tag few-few && ok "restic snapshot готов"
}

# ID на най-новия snapshot (таг few-few) СТРОГО преди момента $1 (ISO, през `date -d`). Печата „ID ВРЕМЕ".
snapshot_before(){
  local cutoff
  cutoff="$(date -d "$1" +%s 2>/dev/null)" || die "Невалиден момент за --before: $1 (пример: 2026-11-14T03:00:00Z)"
  command -v python3 >/dev/null || die "Липсва python3 (нужен за избора на snapshot по време)."
  restic snapshots --tag few-few --json | python3 -c '
import json, re, sys
from datetime import datetime
cutoff = int(sys.argv[1])
best = None
for s in json.load(sys.stdin):
    t = re.sub(r"(\.\d{6})\d+", r"\1", s["time"]).replace("Z", "+00:00")  # restic дава наносекунди
    ts = datetime.fromisoformat(t).timestamp()
    if ts < cutoff and (best is None or ts > best[0]):
        best = (ts, s["id"], s["time"])
if best is None:
    sys.exit(3)
print(best[1], best[2])
' "$cutoff" || die "Няма snapshot (таг few-few) преди $1."
}

# Разбор на --before / --target след подкомандата.
BEFORE=""; TARGET=""
parse_opts(){
  while [ $# -gt 0 ]; do
    case "$1" in
      --before) [ $# -ge 2 ] || die "--before иска момент"; BEFORE="$2"; shift 2;;
      --target) [ $# -ge 2 ] || die "--target иска папка"; TARGET="$2"; shift 2;;
      *) die "Непозната опция: $1";;
    esac
  done
}

cmd_verify(){
  # Цялост, не чистота: зелен check не значи „без пробив" (виж ВАЖНО горе).
  inf "restic check (целост на архива — НЕ доказва липса на компрометиране)…"; restic check --read-data-subset=10%
  local snap="latest" pick tmp
  if [ -n "$BEFORE" ]; then
    pick="$(snapshot_before "$BEFORE")"; snap="${pick%% *}"
    inf "Избран snapshot преди $BEFORE: $pick"
  fi
  tmp="$(mktemp -d)"
  inf "Test-restore на snapshot $snap → $tmp"
  restic restore "$snap" --target "$tmp"
  if [ -s "$tmp$STAGE/zabobovdol.sql" ] || ls "$tmp$STAGE"/medqr-data >/dev/null 2>&1; then
    ok "Възстановяването е читаемо — бекъпът е валиден."
  else
    rm -rf "$tmp"; die "Restore не съдържа очакваните файлове — бекъпът Е ПОД ВЪПРОС."
  fi
  rm -rf "$tmp"
}

# След инцидент: снимката отпреди момента → НОВА папка. Нищо живо не се презаписва.
cmd_restore(){
  [ -n "$BEFORE" ] || die "restore иска --before <ISO> — моментът преди първия признак на инцидента."
  local pick snap target
  pick="$(snapshot_before "$BEFORE")"; snap="${pick%% *}"
  target="${TARGET:-/var/backups/few-few-restore-$(date +%Y%m%d-%H%M%S)}"
  [ ! -e "$target" ] || [ -z "$(ls -A "$target" 2>/dev/null)" ] || die "$target не е празна — избери нова папка (--target)."
  install -d -m 700 "$target"
  inf "Възстановявам snapshot $pick → $target"
  restic restore "$snap" --target "$target"
  ok "Готово: $target (mode 700). Живите данни НЕ са пипани — сравни и върни на ръка, след бекъп на текущото."
}

cmd_prune(){ restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune && ok "prune готов"; }

sub="${1:-verify}"; [ $# -gt 0 ] && shift
parse_opts "$@"
case "$sub" in
  backup)  cmd_backup;;
  verify)  cmd_verify;;
  restore) cmd_restore;;
  prune)   cmd_prune;;
  *) die "backup | verify [--before <ISO>] | restore --before <ISO> [--target <папка>] | prune";;
esac
