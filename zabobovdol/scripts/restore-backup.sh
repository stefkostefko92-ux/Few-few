#!/usr/bin/env bash
#
# restore-backup.sh — ТЕСТ и (по желание) ВЪЗСТАНОВЯВАНЕ на криптиран бекъп.
#
# Защо отделен скрипт от restore-db.sh?
#   restore-db.sh ПРЕЗАПИСВА живата база. Този скрипт е безопасен по подразбиране:
#   само разкриптира и ПОКАЗВА съдържанието (dry-run), без да пипа продукцията.
#   Така можеш редовно да проверяваш, че бекъпите ти наистина се отварят и стават
#   за възстановяване — "бекъп, който не си пробвал да върнеш, не е бекъп".
#
# Формат на бекъпите (виж scripts/backup-db.sh):
#   backups/zabobovdol-YYYYMMDD-HHMMSS.sql.gz.age
#   = pg_dump → gzip → криптиране с age (публичен ключ AGE_RECIPIENT).
#   Разкриптиране изисква ЧАСТНИЯ ключ (age identity), който държиш офлайн.
#
# Употреба:
#   # 1) ТЕСТ (по подразбиране) — само показва съдържанието, не пипа базата:
#   AGE_KEY_FILE=~/backup-key.txt \
#     ./scripts/restore-backup.sh backups/zabobovdol-20260617-000000.sql.gz.age
#
#   # 2) РЕАЛНО възстановяване в БЕЗОПАСНА тестова база (zabobovdol_restore_test):
#   RESTORE_CONFIRM=yes AGE_KEY_FILE=~/backup-key.txt \
#     ./scripts/restore-backup.sh backups/zabobovdol-20260617-000000.sql.gz.age
#
# ВАЖНО: този скрипт НИКОГА не пише в живата база. Възстановява само в
#        отделна (scratch) база, за да не застраши продукцията.
#
set -euo pipefail

# --- Локации ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- Зареждане на .env (за POSTGRES_USER и т.н.), без да чупим set -u ---
load_env() {
  local f="$1"; [ -f "$f" ] || return 0
  set -a; # shellcheck disable=SC1090
  . "$f"; set +a
}
load_env "$ROOT_DIR/.env"
load_env "$ROOT_DIR/.backup.env"

# --- Настройки ---
AGE_KEY_FILE="${AGE_KEY_FILE:-$HOME/backup-key.txt}"   # ЧАСТНИЯТ age ключ
RESTORE_CONFIRM="${RESTORE_CONFIRM:-no}"               # "yes" → реално възстановяване
DB_SERVICE="${BACKUP_DB_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-zabobovdol}"
LIVE_DB="${POSTGRES_DB:-zabobovdol}"                   # живата база — НЕ я пипаме
# Безопасна тестова (scratch) база, в която възстановяваме:
TARGET_DB="${RESTORE_TARGET_DB:-zabobovdol_restore_test}"
COMPOSE="${BACKUP_COMPOSE_CMD:-docker compose}"

log()  { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { printf '\n[ГРЕШКА] %s\n' "$*" >&2; exit 1; }

# --- Аргумент: път до криптирания бекъп ---
FILE="${1:-}"
[ -n "$FILE" ] || fail "Посочи криптиран бекъп файл. Пример:
  AGE_KEY_FILE=~/backup-key.txt $0 backups/zabobovdol-YYYYMMDD-HHMMSS.sql.gz.age"
[ -f "$FILE" ] || fail "Файлът не е намерен: $FILE"

# --- Проверка, че 'age' е наличен (не приемаме, че е инсталиран) ---
if ! command -v age >/dev/null 2>&1; then
  fail "Липсва 'age' — без него не можем да разкриптираме бекъпа.
  Инсталирай го:
    Debian/Ubuntu:  sudo apt install age
    macOS:          brew install age
    Windows:        winget install FiloSottile.age
    Или от:         https://github.com/FiloSottile/age/releases"
fi

# --- Проверка за частния ключ ---
[ -f "$AGE_KEY_FILE" ] || fail "Частният age ключ не е намерен: $AGE_KEY_FILE
  Задай пътя през AGE_KEY_FILE=път_до_ключа (файлът с реда AGE-SECRET-KEY-1...).
  Този ключ го пазиш офлайн — само с него бекъпите се отварят."

# --- (По избор) проверка на контролната сума, ако има .sha256 ---
if [ -f "$FILE.sha256" ]; then
  log "Проверявам целостта (sha256)…"
  want="$(cat "$FILE.sha256")"
  if command -v sha256sum >/dev/null 2>&1; then
    have="$(sha256sum "$FILE" | awk '{print $1}')"
  else
    have="$(shasum -a 256 "$FILE" | awk '{print $1}')"
  fi
  [ "$want" = "$have" ] || fail "Контролната сума НЕ съвпада — файлът е повреден или подменен!"
  log "Целостта е наред."
fi

# --- Команда за разкриптиране (age с частен ключ) → gunzip ---
# Декриптираме и разархивираме в общ pipeline, за да не остане некриптиран файл.
decrypt_stream() {
  age -d -i "$AGE_KEY_FILE" "$FILE" | gunzip
}

# =====================================================================
#  РЕЖИМ 1: DRY-RUN (по подразбиране) — само показваме, без да пипаме базата
# =====================================================================
if [ "$RESTORE_CONFIRM" != "yes" ]; then
  echo
  log "РЕЖИМ: ТЕСТ (dry-run). Базата НЕ се променя."
  log "Разкриптирам $FILE и показвам какво съдържа…"
  echo
  echo "----- Първи редове от SQL дъмпа (заглавна част) -------------------"
  decrypt_stream | head -n 30 || fail "Разкриптирането се провали (грешен ключ или повреден файл?)."
  echo "-------------------------------------------------------------------"
  echo
  echo "----- Таблици в дъмпа (CREATE TABLE) ------------------------------"
  # Изреждаме имената на таблиците, които биха се създали.
  decrypt_stream \
    | grep -E '^CREATE TABLE ' \
    | sed -E 's/^CREATE TABLE (IF NOT EXISTS )?//; s/ \(.*//' \
    || true
  echo "-------------------------------------------------------------------"
  echo
  log "Дотук бекъпът се РАЗКРИПТИРА успешно и изглежда валиден SQL дъмп. Това е добрият знак."
  echo
  cat <<EOF
За да направиш РЕАЛНО възстановяване в БЕЗОПАСНА тестова база ($TARGET_DB),
пусни същата команда с RESTORE_CONFIRM=yes:

  RESTORE_CONFIRM=yes AGE_KEY_FILE="$AGE_KEY_FILE" \\
    $0 "$FILE"

Това НЯМА да пипне живата база "$LIVE_DB" — ще зареди данните в отделна
база "$TARGET_DB", за да провериш, че всичко се връща коректно.
EOF
  exit 0
fi

# =====================================================================
#  РЕЖИМ 2: РЕАЛНО възстановяване в БЕЗОПАСНА тестова база
# =====================================================================
echo
log "РЕЖИМ: реално възстановяване в ТЕСТОВА база '$TARGET_DB'."
log "Живата база '$LIVE_DB' НЯМА да бъде променяна."

[ "$TARGET_DB" != "$LIVE_DB" ] \
  || fail "Целевата база ($TARGET_DB) съвпада с живата ($LIVE_DB) — отказвам, за да не застраша продукцията.
  Задай различна с RESTORE_TARGET_DB=име_на_тестова_база."

# Помощник за psql през docker compose (към сървърната, не към конкретна база).
psql_admin() { $COMPOSE exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d postgres "$@"; }
psql_target() { $COMPOSE exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$TARGET_DB" "$@"; }

log "Проверявам, че базата работи…"
$COMPOSE exec -T "$DB_SERVICE" pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1 \
  || fail "Базата не отговаря. Стартирана ли е? ($COMPOSE up -d)"

# Пресъздаваме чиста тестова база (трием САМО тестовата, не живата).
log "Пресъздавам чиста тестова база '$TARGET_DB'…"
psql_admin -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" \
  || fail "Не успях да изтрия старата тестова база."
psql_admin -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TARGET_DB\";" \
  || fail "Не успях да създам тестовата база."

log "Разкриптирам и зареждам дъмпа в '$TARGET_DB'…"
decrypt_stream \
  | psql_target \
  || fail "Възстановяването се провали (грешен ключ или повреден файл?)."

# Бърза проверка: колко таблици има в тестовата база след restore.
tbl_count="$(psql_target -t -A -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo '?')"

echo
log "ГОТОВО. Бекъпът се възстанови успешно в тестовата база '$TARGET_DB'."
log "Брой таблици в '$TARGET_DB': $tbl_count"
echo
cat <<EOF
Това потвърждава, че бекъпът е изправен и може да се възстанови.
Живата база "$LIVE_DB" НЕ е пипана.

Да разгледаш тестовата база:
  $COMPOSE exec $DB_SERVICE psql -U $POSTGRES_USER -d $TARGET_DB

Да изтриеш тестовата база, когато приключиш:
  $COMPOSE exec $DB_SERVICE psql -U $POSTGRES_USER -d postgres -c 'DROP DATABASE "$TARGET_DB";'

ВАЖНО: ако някога трябва да възстановиш РЕАЛНО върху живата база (при авария),
ползвай scripts/restore-db.sh — той презаписва "$LIVE_DB" и иска изрично потвърждение.
EOF
