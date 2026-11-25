#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# korpora/deploy/backup-restore.sh — възстановяване от дневния шифрован бекъп (DEPLOY.md, т. 10).
# Пуска се от папката на работещия release (там е и backup.sh, от който взима общите функции):
#
#   R="$(cat /opt/few-few/shared/korpora/last-good)"
#   bash "$R/deploy/backup-restore.sh" --into korpora_restore_<име> [--keep] ВХОД   # репетиция
#   bash "$R/deploy/backup-restore.sh" --live --yes-i-know ВХОД                     # авария
#
#   ВХОД: `-` — дъмпът (pg_dump custom), разшифрован при собственика и подаден на stdin през ssh: частният
#         ключ не стъпва на сървъра (препоръчано); или --identity КЛЮЧ ФАЙЛ.dump.age — разшифроване тук.
#
# --into: нова празна база до живата, проверка (таблици, миграции, акаунти), после се трие (--keep я
#         оставя). Живата база и приложението не се пипат.
# --live: РАЗРУШИТЕЛНО — всичко след бекъпа се губи. Спира приложението, прави шифрована снимка на
#         сегашната база (pre-restore-*.dump.age, към същите получатели), заменя схемата като ЕДНА
#         транзакция (при грешка базата остава каквато е) и пуска приложението отново — и при грешка.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# shellcheck source=backup.sh
source "$(dirname "${BASH_SOURCE[0]}")/backup.sh"
MIN_TABLES="${KORPORA_RESTORE_MIN_TABLES:-10}"
CID="" SRC="" IDENTITY="" APP_ID=""

usage() {
  die "употреба: backup-restore.sh (--into korpora_restore_<име> [--keep] | --live --yes-i-know) (- | --identity КЛЮЧ ФАЙЛ.dump.age)"
}

# SQL към базата $1 в контейнера. Изходът са само броеве и имена на миграции — никакви данни.
# Без -i: `docker exec -i` копира stdin в контейнера, дори командата да не го чете, и при вход `-`
# изяжда началото на дъмпа, преди той да стигне до pg_restore. Stdin се дава само на load_into.
sql() {
  docker exec "$CID" psql -X -q -tA -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$1" -c "$2"
}

# Разшифрованият дъмп към stdout: от stdin (разшифрован при собственика) или от файла с ключа.
plain_dump() {
  if [ "$SRC" = - ]; then cat; else "$AGE" -d -i "$IDENTITY" "$SRC"; fi
}

# Дъмпът става SQL (pg_restore в контейнера) и влиза в базата $1 като ЕДНА транзакция. COMMIT се
# добавя само ако pg_restore е прочел дъмпа докрай: `psql --single-transaction` потвърждава и при
# внезапен край на входа, тоест отрязан дъмп би влязъл наполовина след DROP SCHEMA. Без COMMIT psql
# стига края на входа, а PostgreSQL връща всичко назад при затварянето на връзката. DROP SCHEMA е нужен,
# защото обект от по-нова миграция с външен ключ към стар би спрял триенето; дъмпът връща и
# _prisma_migrations, затова `migrate resolve` след това не трябва.
load_into() {
  {
    printf 'BEGIN;\nSET client_min_messages = warning;\nDROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\n'
    plain_dump | docker exec -i "$CID" pg_restore -f - --no-owner --no-acl || exit 1
    printf 'COMMIT;\n'
  } | docker exec -i "$CID" psql -X -q -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$1" -f - >/dev/null
}

# Годно ли е възстановеното: таблици, приложени Prisma миграции, таблицата с акаунтите (само броеве).
check_restored() {
  local tables migrations last users
  tables="$(sql "$1" "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")" ||
    die "възстановената база $1 не се чете."
  migrations="$(sql "$1" 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')" ||
    die "в $1 няма _prisma_migrations — това не е бекъп на Korpora."
  last="$(sql "$1" 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1')" ||
    last="?"
  users="$(sql "$1" 'SELECT count(*) FROM "User"')" || die "в $1 няма таблица \"User\" — бекъпът е орязан."
  [ "$tables" -ge "$MIN_TABLES" ] || die "само $tables таблици в $1 (очаквани поне $MIN_TABLES) — бекъпът е орязан."
  [ "$migrations" -gt 0 ] || die "в $1 няма нито една приложена миграция — бекъпът не е годен."
  log "възстановено в $1: $tables таблици, $migrations миграции (последна $last), $users акаунта"
}

# Приложението тръгва отново при всеки изход от --live, и при грешка (базата тогава е каквато беше).
restart_app() {
  cleanup
  if [ -n "$APP_ID" ]; then
    if docker start "$APP_ID" >/dev/null; then log "приложението е пуснато отново"; else warn "приложението не тръгна — docker start $APP_ID"; fi
  fi
}

# Входът: stdin не е терминал, а файлът е с ключ и с вярна контролна сума.
check_source() {
  if [ "$SRC" = - ]; then
    [ ! -t 0 ] || die "очаквам разшифрования дъмп на stdin (DEPLOY.md, т. 10)."
    return 0
  fi
  [ -f "$SRC" ] && [ -n "$IDENTITY" ] && [ -f "$IDENTITY" ] ||
    die "за файл трябва и --identity с частния ключ (по-добре: разшифровай при себе си и подай на stdin)."
  command -v "$AGE" >/dev/null 2>&1 || die "липсва age (apt-get install -y age)."
  if [ -f "$SRC.sha256" ]; then
    (cd "$(dirname "$SRC")" && sha256sum -c --quiet "$(basename "$SRC").sha256") ||
      die "контролната сума на $(basename "$SRC") не съвпада — файлът е повреден."
  else
    warn "няма $(basename "$SRC").sha256 — целостта я проверява само age при разшифроването."
  fi
}

drill() {
  local into="$1" keep="$2"
  sql postgres "CREATE DATABASE \"$into\"" >/dev/null || die "базата $into не се създаде (вече има ли такава?)."
  if ! load_into "$into"; then
    sql postgres "DROP DATABASE IF EXISTS \"$into\"" >/dev/null || true
    die "възстановяването в $into се провали — живата база не е пипана."
  fi
  check_restored "$into"
  if [ "$keep" = 1 ]; then
    log "$into остава за оглед; после: docker exec $CID dropdb -U $DB_USER $into"
  else
    sql postgres "DROP DATABASE \"$into\"" >/dev/null || die "репетицията мина, но $into не се изтри."
    log "репетицията мина; $into е изтрита"
  fi
}

live() {
  local snap
  check_recipients
  APP_ID="$(container app)" || APP_ID=""
  trap restart_app EXIT
  if [ -n "$APP_ID" ]; then docker stop "$APP_ID" >/dev/null || die "приложението не спря — базата не е пипана."; fi
  snap="$SHARED/backups/pre-restore-$(date -u +%Y%m%d-%H%M%S).dump.age"
  install -d -m 700 "$SHARED/backups"
  dump_to "$CID" "$snap"
  load_into "$DB_NAME" || die "възстановяването се провали — живата база е каквато беше (една транзакция)."
  check_restored "$DB_NAME"
  log "снимката отпреди възстановяването: $snap"
  log "сега: котвата на одита (DEPLOY.md, т. 8 — Одитът) и curl -fsS http://127.0.0.1:4320/health"
}

main() {
  local into="" mode="" sure=0 keep=0
  [ "$(id -u)" = 0 ] || die "пусни като root (sudo)."
  while [ $# -gt 0 ]; do
    case "$1" in
      --into) [ $# -ge 2 ] || usage && into="$2" && mode=into && shift 2 ;;
      --live) mode=live && shift ;;
      --yes-i-know) sure=1 && shift ;;
      --keep) keep=1 && shift ;;
      --identity) [ $# -ge 2 ] || usage && IDENTITY="$2" && shift 2 ;;
      -) SRC=- && shift ;;
      -*) usage ;;
      *) SRC="$1" && shift ;;
    esac
  done
  [ -n "$SRC" ] && [ -n "$mode" ] || usage
  if [ "$mode" = live ]; then
    [ -z "$into" ] || usage
    [ "$sure" = 1 ] || die "--live заменя живата база с бекъпа (всичко след него се губи) — потвърди с --yes-i-know."
  elif ! [[ "$into" =~ ^korpora_restore_[a-z0-9_]{1,40}$ ]]; then
    die "--into иска име korpora_restore_<малки букви, цифри, _> — живата база не се пипа оттук."
  fi
  check_source
  lock
  CID="$(container db)" || die "няма работещ контейнер на базата (compose проект $PROJECT, услуга db)."
  if [ "$mode" = live ]; then live; else drill "$into" "$keep"; fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
