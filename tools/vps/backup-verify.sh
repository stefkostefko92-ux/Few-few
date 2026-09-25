#!/usr/bin/env bash
# backup-verify.sh — бекъп И проверено възстановяване (VPS-аджията v2.0).
# Бекъп без тестван restore не е бекъп. Прави restic snapshot и после възстановява
# в временна папка, за да докаже, че архивът е читаем.
#
# Подкоманди:
#   backup     — pg_dump (zabobovdol) + data/ (medqr) → restic repo
#   verify     — restic check + test-restore на последния snapshot в temp + сверка
#   prune      — изчисти стари snapshot-и по политика
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

cmd_verify(){
  inf "restic check (целост)…"; restic check --read-data-subset=10%
  local tmp; tmp="$(mktemp -d)"
  inf "Test-restore на последния snapshot → $tmp"
  restic restore latest --target "$tmp"
  if [ -s "$tmp$STAGE/zabobovdol.sql" ] || ls "$tmp$STAGE"/medqr-data >/dev/null 2>&1; then
    ok "Възстановяването е читаемо — бекъпът е валиден."
  else
    rm -rf "$tmp"; die "Restore не съдържа очакваните файлове — бекъпът Е ПОД ВЪПРОС."
  fi
  rm -rf "$tmp"
}

cmd_prune(){ restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune && ok "prune готов"; }

case "${1:-verify}" in backup) cmd_backup;; verify) cmd_verify;; prune) cmd_prune;; *) die "backup|verify|prune";; esac
