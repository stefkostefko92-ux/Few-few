#!/usr/bin/env bash
#
# Възстановяване (restore) на базата от криптиран бекъп.
#
# ВНИМАНИЕ: този скрипт ИЗИСКВА твоя ЧАСТЕН ключ (age identity или GPG
# частен ключ). Без него никой не може да възстанови данните — точно
# това е целта. Дръж частния ключ само у себе си, офлайн.
#
# Употреба:
#   AGE_IDENTITY="$HOME/.config/zabobovdol/backup-key.txt" \
#     ./scripts/restore-db.sh backups/zabobovdol-YYYYMMDD-HHMMSS.sql.gz.age
#
#   (за GPG просто файлът да е .gpg и частният ключ да е в твоя gpg ключодържател)
#
# По подразбиране иска изрично потвърждение, защото ПРЕЗАПИСВА базата.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

load_env() {
  local f="$1"; [ -f "$f" ] || return 0
  set -a; # shellcheck disable=SC1090
  . "$f"; set +a
}
load_env "$ROOT_DIR/.env"
load_env "$ROOT_DIR/.backup.env"

DB_SERVICE="${BACKUP_DB_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-zabobovdol}"
POSTGRES_DB="${POSTGRES_DB:-zabobovdol}"
COMPOSE="${BACKUP_COMPOSE_CMD:-docker compose}"

fail() { printf '[ГРЕШКА] %s\n' "$*" >&2; exit 1; }
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

FILE="${1:-}"
[ -n "$FILE" ] || fail "Посочи файл за възстановяване. Пример:
  AGE_IDENTITY=~/.config/zabobovdol/backup-key.txt $0 backups/zabobovdol-XXXX.sql.gz.age"
[ -f "$FILE" ] || fail "Файлът не е намерен: $FILE"

# --- Проверка на контролната сума, ако има .sha256 ---
if [ -f "$FILE.sha256" ]; then
  log "Проверявам целостта (sha256)…"
  want="$(cat "$FILE.sha256")"
  have="$(sha256sum "$FILE" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$FILE" | awk '{print $1}')"
  [ "$want" = "$have" ] || fail "Контролната сума НЕ съвпада — файлът е повреден или подменен!"
  log "Целостта е наред."
fi

# --- Избор на метод за разкриптиране според разширението ---
case "$FILE" in
  *.age)
    command -v age >/dev/null 2>&1 || fail "Липсва 'age'. Инсталирай го, за да разкриптираш."
    [ -n "${AGE_IDENTITY:-}" ] || fail "Задай AGE_IDENTITY=път_до_частния_ключ (age identity файл)."
    [ -f "$AGE_IDENTITY" ] || fail "Частният ключ не е намерен: $AGE_IDENTITY"
    DECRYPT=(age -d -i "$AGE_IDENTITY" "$FILE")
    ;;
  *.gpg)
    command -v gpg >/dev/null 2>&1 || fail "Липсва 'gpg'."
    DECRYPT=(gpg --quiet --decrypt "$FILE")
    ;;
  *)
    fail "Непознато разширение. Очаквам .age или .gpg файл."
    ;;
esac

echo
echo "  ВНИМАНИЕ: това ще ПРЕЗАПИШЕ съдържанието на база '$POSTGRES_DB'."
echo "  Файл: $FILE"
printf "  Сигурен ли си? Напиши с главни букви ДА за продължение: "
read -r ans
[ "$ans" = "ДА" ] || fail "Отказано от потребителя."

log "Разкриптиране и възстановяване…"
"${DECRYPT[@]}" \
  | gunzip \
  | $COMPOSE exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  || fail "Възстановяването се провали (грешен ключ или повреден файл?)."

log "Готово. Базата е възстановена от $(basename "$FILE")."
log "Препоръка: рестартирай приложението — $COMPOSE restart app"
