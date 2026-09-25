#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-postgres.sh — възстановяване на PostgreSQL базата на Supreme Bot от
# криптиран бекъп (supreme-*.dump.gpg), направен от backup-postgres.sh.
#
# ⚠ РАЗРУШИТЕЛНА ОПЕРАЦИЯ: pg_restore --clean изтрива и пресъздава обектите в
#   базата. Всичко, влязло СЛЕД избрания бекъп, се губи. Затова:
#     • иска изричен флаг --yes-i-know
#     • прави „преди-restore“ снимка на текущата база (освен ако --no-pre-dump)
#     • спира backend и bot, за да не пишат по време на възстановяването
#
# Употреба:
#   sudo /usr/local/sbin/supreme-restore-postgres \
#        /var/backups/supreme/supreme-20260805-0300.dump.gpg --yes-i-know
#
# Тест на restore (задължителен по DPA — виж deploy/BACKUP.md):
#   ...--yes-i-know --into supreme_restore_test    # възстановява в ТЕСТОВА база,
#                                                  # без да пипа живата
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/few-few/current/SupremeDiscordBot}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/supreme}"
PASSPHRASE_FILE="${PASSPHRASE_FILE:-/root/.supreme-backup-pass}"
PG_CONTAINER="${PG_CONTAINER:-supremebot_postgres}"
PG_SERVICE="${PG_SERVICE:-postgres}"
APP_SERVICES="${APP_SERVICES:-backend bot}"
export GNUPGHOME="${GNUPGHOME:-/root/.gnupg}"

log()  { printf '▸ %s\n' "$*"; }
ok()   { printf '✔ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*" >&2; }
die()  { printf '✘ %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Употреба:
  restore-postgres.sh <файл.dump.gpg> --yes-i-know [опции]

Опции:
  --yes-i-know          задължително потвърждение (без него скриптът не прави нищо)
  --into <база>         възстанови в ДРУГА база (тестов restore; живата не се пипа)
  --no-pre-dump         прескочи снимката на текущата база (НЕ се препоръчва)
  --list                само покажи съдържанието на бекъпа (без промени)
  -h | --help           тази помощ

Пример (тестов restore, безопасно):
  sudo restore-postgres.sh /var/backups/supreme/supreme-20260805-0300.dump.gpg \
       --yes-i-know --into supreme_restore_test
USAGE
}

FILE=""; CONFIRM=0; INTO=""; PRE_DUMP=1; LIST_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes-i-know) CONFIRM=1 ;;
    --into)       INTO="${2:-}"; shift ;;
    --no-pre-dump) PRE_DUMP=0 ;;
    --list)       LIST_ONLY=1 ;;
    -h|--help)    usage; exit 0 ;;
    -*)           die "Непознат флаг: $1 (виж --help)" ;;
    *)            FILE="$1" ;;
  esac
  shift
done

[ -n "$FILE" ] || { usage; die "Не е подаден файл за възстановяване."; }
[ -f "$FILE" ] || die "Няма такъв файл: $FILE"
[ "$(id -u)" = "0" ] || die "Пусни като root."
command -v docker >/dev/null || die "Липсва docker."
command -v gpg    >/dev/null || die "Липсва gpg."
[ -s "$PASSPHRASE_FILE" ] || die "Липсва/празен файл с парола: $PASSPHRASE_FILE"

# ── Достъп до базата: compose (основно) или docker exec (резервно) ───────────
if [ -d "$COMPOSE_DIR" ] && [ -f "$COMPOSE_DIR/docker-compose.yml" ] && [ -f "$COMPOSE_DIR/.env" ]; then
  PG_MODE="compose"
elif docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  PG_MODE="exec"
else
  die "Не намирам работеща база (нито compose в $COMPOSE_DIR, нито контейнер $PG_CONTAINER)."
fi

pg_in() {
  if [ "$PG_MODE" = "compose" ]; then ( cd "$COMPOSE_DIR" && docker compose exec -T "$PG_SERVICE" "$@" )
  else docker exec -i "$PG_CONTAINER" "$@"; fi
}
compose() { ( cd "$COMPOSE_DIR" && docker compose "$@" ); }

env_val() {
  [ -f "$COMPOSE_DIR/.env" ] || return 0
  grep -E "^${1}=" "$COMPOSE_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\042\047\r'
}
POSTGRES_USER="${POSTGRES_USER:-$(env_val POSTGRES_USER)}"
POSTGRES_DB="${POSTGRES_DB:-$(env_val POSTGRES_DB)}"
[ -n "$POSTGRES_USER" ] || POSTGRES_USER="$(pg_in printenv POSTGRES_USER 2>/dev/null | tr -d '\r' || true)"
[ -n "$POSTGRES_DB" ]   || POSTGRES_DB="$(pg_in printenv POSTGRES_DB   2>/dev/null | tr -d '\r' || true)"
POSTGRES_USER="${POSTGRES_USER:-bot}"
POSTGRES_DB="${POSTGRES_DB:-discordbot}"
TARGET_DB="${INTO:-$POSTGRES_DB}"

gpg_dec() {
  gpg --batch --yes --quiet --pinentry-mode loopback --no-symkey-cache \
      --passphrase-file "$PASSPHRASE_FILE" --decrypt "$1"
}

# ── Проверка на целостта преди каквото и да е ────────────────────────────────
if [ -f "$FILE.sha256" ]; then
  want="$(cat "$FILE.sha256")"; have="$(sha256sum "$FILE" | awk '{print $1}')"
  [ "$want" = "$have" ] || die "SHA256 не съвпада — файлът е повреден/подменен. Спирам."
  ok "SHA256 съвпада."
fi
magic="$(gpg_dec "$FILE" 2>/dev/null | head -c 5 || true)"
[ "$magic" = "PGDMP" ] || die "Файлът не се разкриптира с $PASSPHRASE_FILE или не е pg_dump custom формат."
ok "Бекъпът се разкриптира и е валиден pg_dump custom формат."

# ── Само списък на съдържанието (нищо не се променя) ─────────────────────────
if [ "$LIST_ONLY" = "1" ]; then
  # 2>/dev/null: head затваря тръбата → gpg вика „Broken pipe“, което тук е нормално.
  gpg_dec "$FILE" 2>/dev/null | pg_in pg_restore --list | head -n 60 || true
  exit 0
fi

[ "$CONFIRM" = "1" ] || die "Липсва --yes-i-know. Това презаписва базата „$TARGET_DB“ — нищо не е направено."

log "Файл:        $FILE"
log "Цел (база):  $TARGET_DB   (жива база: $POSTGRES_DB)"
log "Режим:       $PG_MODE"

# ── Снимка на текущото състояние ПРЕДИ да пипаме (застраховка) ───────────────
if [ "$PRE_DUMP" = "1" ]; then
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
  PRE="$BACKUP_DIR/pre-restore-$(date -u +%Y%m%d-%H%M%S).dump"
  umask 077
  if pg_in pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" "$TARGET_DB" > "$PRE" 2>/dev/null \
     && [ "$(stat -c '%s' "$PRE" 2>/dev/null || echo 0)" -ge 1024 ]; then
    ok "Снимка преди restore: $PRE"
  else
    rm -f "$PRE"
    warn "Не успях да направя снимка на „$TARGET_DB“ (нова/празна база?)."
    [ -n "$INTO" ] || die "Без снимка на ЖИВАТА база не продължавам. Ползвай --no-pre-dump, ако наистина си сигурен."
  fi
fi

# ── Спираме писачите (backend + bot), за да е консистентно ───────────────────
STOPPED=""
if [ -z "$INTO" ] && [ "$PG_MODE" = "compose" ]; then
  log "Спирам $APP_SERVICES…"
  compose stop $APP_SERVICES >/dev/null 2>&1 && STOPPED="1" || warn "Не успях да спра $APP_SERVICES — продължавам."
elif [ -z "$INTO" ]; then
  for c in supremebot_backend supremebot_bot; do docker stop "$c" >/dev/null 2>&1 || true; done
  STOPPED="1"
fi
restart_apps() {
  [ -n "$STOPPED" ] || return 0
  log "Пускам обратно $APP_SERVICES…"
  if [ "$PG_MODE" = "compose" ]; then compose start $APP_SERVICES >/dev/null 2>&1 || warn "Ръчно: docker compose start $APP_SERVICES"
  else for c in supremebot_backend supremebot_bot; do docker start "$c" >/dev/null 2>&1 || true; done; fi
}
trap 'restart_apps' EXIT

# ── Тестова база: създаваме я, ако липсва ────────────────────────────────────
if [ -n "$INTO" ]; then
  pg_in psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$INTO'" | grep -q 1 \
    || pg_in createdb -U "$POSTGRES_USER" "$INTO"
  ok "Тестова база готова: $INTO"
fi

# ── Самото възстановяване ────────────────────────────────────────────────────
log "Възстановявам в „$TARGET_DB“ (pg_restore --clean --if-exists)…"
rc=0
gpg_dec "$FILE" | pg_in pg_restore --clean --if-exists --no-owner --no-acl \
  -U "$POSTGRES_USER" -d "$TARGET_DB" || rc=$?
if [ "$rc" != "0" ]; then
  warn "pg_restore върна код $rc. Част от предупрежденията са нормални (DROP на несъществуващи обекти)."
  warn "ПРОВЕРИ изхода по-горе. При реален провал върни снимката: $BACKUP_DIR/pre-restore-*.dump"
fi

# ── Проверка след възстановяване ─────────────────────────────────────────────
tables="$(pg_in psql -U "$POSTGRES_USER" -d "$TARGET_DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d '\r ')" || tables=0
[ "${tables:-0}" -gt 0 ] || die "След restore в „$TARGET_DB“ няма нито една таблица — възстановяването се провали."
ok "Възстановено: $tables таблици в „$TARGET_DB“."

if [ -n "$INTO" ]; then
  ok "Тестовият restore мина. Изтрий тестовата база, когато си готов:"
  echo "   docker exec -i $PG_CONTAINER dropdb -U $POSTGRES_USER $INTO"
else
  ok "Готово. Провери здравето: curl -fsS http://127.0.0.1:8080/ и docker compose ps"
fi
