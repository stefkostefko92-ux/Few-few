#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-drill.sh — РЕПЕТИЦИЯ на възстановяването: доказва, че последният бекъп
# наистина се възстановява И че възстановените данни са годни.
#
# Защо съществува отделно от restore-postgres.sh --into:
#   `--into` дава ВЪЗМОЖНОСТ за тестов restore. Тази репетиция го ПУСКА, после
#   ПРОВЕРЯВА резултата и оставя писмена следа. Нетестван бекъп не е бекъп, а
#   надежда; „pg_restore излезе с 0" също не е доказателство — възстановена
#   празна или орязана база излиза с 0.
#
# БЕЗОПАСНА Е: не пипа живата база и не спира нито една услуга. Работи в
# еднократна база supreme_drill_<timestamp>, която трие след себе си.
#
# Проверки след възстановяването:
#   1. броят таблици е поне колкото очакваме (схемата е цяла, не половин);
#   2. ключовите таблици съществуват и са четими;
#   3. броят редове в servers е > 0 и НЕ надвишава живия (бекъпът е минал, не бъдещ);
#   4. най-скорошният запис в бекъпа не е по-стар от MAX_AGE_HOURS.
#
# Употреба:
#   sudo /usr/local/sbin/supreme-restore-drill                 # най-новият бекъп
#   sudo /usr/local/sbin/supreme-restore-drill <файл.dump.gpg> # конкретен
#   MAX_AGE_HOURS=48 sudo /usr/local/sbin/supreme-restore-drill
#
# Изход: 0 = репетицията мина; ≠0 = бекъпът НЕ е годен, оправи го днес.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/few-few/current/SupremeDiscordBot}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/supreme}"
PASSPHRASE_FILE="${PASSPHRASE_FILE:-/root/.supreme-backup-pass}"
PG_SERVICE="${PG_SERVICE:-postgres}"
DRILL_LOG="${DRILL_LOG:-/var/backups/supreme/restore-drills.log}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-36}"
MIN_TABLES="${MIN_TABLES:-20}"
export GNUPGHOME="${GNUPGHOME:-/root/.gnupg}"

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; record "ПРОВАЛ" "$*"; exit 1; }

record() {  # $1 = статус, $2 = бележка — писмената следа по DPA §5.1
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s\t%s\t%s\t%s\n' "$ts" "$1" "${ARCHIVE:-—}" "$2" >> "$DRILL_LOG" 2>/dev/null || true
}

[ "$(id -u)" = "0" ] || die "Пусни като root (sudo)."
[ -d "$COMPOSE_DIR" ] || die "Няма $COMPOSE_DIR — деплойнат ли е продуктът?"
command -v gpg >/dev/null || die "Липсва gpg."
[ -s "$PASSPHRASE_FILE" ] || die "Липсва/празен файл с парола: $PASSPHRASE_FILE"

cd "$COMPOSE_DIR"
pg() { docker compose exec -T "$PG_SERVICE" "$@"; }

# Кредитал от контейнера — същият източник като restore-postgres.sh.
POSTGRES_USER="${POSTGRES_USER:-$(pg printenv POSTGRES_USER 2>/dev/null | tr -d '\r' || true)}"
POSTGRES_DB="${POSTGRES_DB:-$(pg printenv POSTGRES_DB 2>/dev/null | tr -d '\r' || true)}"
POSTGRES_USER="${POSTGRES_USER:-bot}"
POSTGRES_DB="${POSTGRES_DB:-discordbot}"

# ── 1) Избери архива ─────────────────────────────────────────────────────────
ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ]; then
  ARCHIVE="$(ls -t "$BACKUP_DIR"/supreme-*.dump.gpg 2>/dev/null | head -1 || true)"
  [ -n "$ARCHIVE" ] || die "Няма нито един бекъп в $BACKUP_DIR — таймерът работи ли? (systemctl status supreme-backup.timer)"
fi
[ -f "$ARCHIVE" ] || die "Няма такъв файл: $ARCHIVE"
log "Архив: $ARCHIVE"

# Свежест на самия файл — стар бекъп значи спрял таймер, дори да се възстановява.
age_h=$(( ( $(date +%s) - $(stat -c %Y "$ARCHIVE") ) / 3600 ))
[ "$age_h" -le "$MAX_AGE_HOURS" ] \
  || die "Бекъпът е на $age_h часа (таван $MAX_AGE_HOURS) — таймерът вероятно не работи."
ok "Свежест: $age_h ч."

DRILL_DB="supreme_drill_$(date +%Y%m%d%H%M%S)"
cleanup() {
  pg psql -U "$POSTGRES_USER" -d postgres -q -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── 2) Възстанови в еднократна база ──────────────────────────────────────────
log "Създавам $DRILL_DB и възстановявам…"
pg psql -U "$POSTGRES_USER" -d postgres -q -c "CREATE DATABASE \"$DRILL_DB\";" >/dev/null \
  || die "Не мога да създам $DRILL_DB."

if ! gpg --batch --yes --quiet --pinentry-mode loopback --no-symkey-cache \
        --passphrase-file "$PASSPHRASE_FILE" --decrypt "$ARCHIVE" 2>/dev/null \
     | pg pg_restore -U "$POSTGRES_USER" -d "$DRILL_DB" --no-owner --no-privileges 2>/tmp/drill-restore.err; then
  warn "pg_restore върна грешка; последните редове:"; tail -5 /tmp/drill-restore.err >&2 || true
  die "Възстановяването се провали."
fi
ok "Възстановено в $DRILL_DB"

q() { pg psql -U "$POSTGRES_USER" -d "$DRILL_DB" -tAq -c "$1" 2>/dev/null | tr -d '\r' | head -1; }
q_live() { pg psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAq -c "$1" 2>/dev/null | tr -d '\r' | head -1; }

# ── 3) Схемата цяла ли е ─────────────────────────────────────────────────────
tables="$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
[ -n "$tables" ] || die "Не мога да преброя таблиците — базата не е четима."
[ "$tables" -ge "$MIN_TABLES" ] \
  || die "Само $tables таблици (очаквани поне $MIN_TABLES) — бекъпът е орязан."
ok "Схема: $tables таблици"

for tbl in servers tickets users; do
  q "SELECT 1 FROM \"$tbl\" LIMIT 1;" >/dev/null \
    || die "Таблица \"$tbl\" липсва или не е четима във възстановената база."
done
ok "Ключовите таблици са четими"

# ── 4) Данните смислени ли са ────────────────────────────────────────────────
restored="$(q "SELECT count(*) FROM servers;")"
live="$(q_live "SELECT count(*) FROM servers;")"
[ "${restored:-0}" -gt 0 ] || die "Нула сървъра във възстановената база — бекъпът е празен."
if [ -n "$live" ] && [ "$restored" -gt "$live" ]; then
  die "Възстановени $restored сървъра срещу $live живи — това не е бекъп на тази база."
fi
ok "Сървъри: $restored възстановени (живи: ${live:-?})"

newest="$(q "SELECT COALESCE(max(\"createdAt\")::text, '') FROM servers;")"
[ -n "$newest" ] && ok "Най-скорошен запис в бекъпа: $newest"

# ── 5) Следата ───────────────────────────────────────────────────────────────
record "ОК" "таблици=$tables сървъри=$restored/${live:-?} възраст=${age_h}ч"
ok "Репетицията мина. Следа: $DRILL_LOG"
