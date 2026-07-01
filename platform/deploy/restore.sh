#!/usr/bin/env bash
#
# Възстановяване на platform от криптиран бекъп (виж backup.sh).
#
# Изисква ЧАСТНИЯ ключ (age identity или GPG частен ключ), който държиш ОФЛАЙН.
# Разрушителна операция: презаписва текущата база / качвания. Пита за
# потвърждение (освен ако -y). Преди възстановяване прави „safety" бекъп.
#
# Употреба:
#   # само базата:
#   AGE_IDENTITY=~/keys/platform.age.key \
#     bash platform/deploy/restore.sh --db backups/platform-db-YYYYMMDD-HHMMSS.sql.gz.age
#   # само качванията:
#   AGE_IDENTITY=~/keys/platform.age.key \
#     bash platform/deploy/restore.sh --uploads backups/platform-uploads-...tar.gz.age
#   # и двете (подай двата файла):
#   bash platform/deploy/restore.sh --db <db.age> --uploads <uploads.age>
#
# С GPG: имай частния ключ в keyring-а; скриптът ползва `gpg -d` автоматично.
# Пропусни потвърждението с -y (за автоматизация).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"     # platform/
cd "$ROOT_DIR"

load_env() { [ -f "$1" ] || return 0; set -a; . "$1"; set +a; }
load_env "$ROOT_DIR/.env"
load_env "$ROOT_DIR/.backup.env"

DB_SERVICE="${BACKUP_DB_SERVICE:-db}"
WEB_SERVICE="${BACKUP_WEB_SERVICE:-web}"
UPLOADS_PATH="${BACKUP_UPLOADS_PATH:-/data/uploads}"
POSTGRES_USER="${POSTGRES_USER:-platform}"
POSTGRES_DB="${POSTGRES_DB:-platform}"
COMPOSE="${BACKUP_COMPOSE_CMD:-docker compose}"
COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
DOCKER="${BACKUP_DOCKER_CMD:-docker}"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-busybox}"
DC() { $COMPOSE -f "$COMPOSE_FILE" "$@"; }

detect_uploads_volume() {
  if [ -n "${BACKUP_UPLOADS_VOLUME:-}" ]; then printf '%s' "$BACKUP_UPLOADS_VOLUME"; return; fi
  local proj
  proj="$(DC config 2>/dev/null | awk -F': ' '/^name:/{print $2; exit}')"
  [ -n "$proj" ] || proj="$(basename "$ROOT_DIR")"
  printf '%s_uploads' "$proj"
}
UPLOADS_VOLUME="$(detect_uploads_volume)"

DB_FILE=""; UPLOADS_FILE=""; ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB_FILE="$2"; shift 2 ;;
    --uploads) UPLOADS_FILE="$2"; shift 2 ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    *) printf 'Непознат аргумент: %s\n' "$1" >&2; exit 2 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { printf '[ГРЕШКА] %s\n' "$*" >&2; exit 1; }

[ -n "$DB_FILE$UPLOADS_FILE" ] || fail "Подай поне --db и/или --uploads с път до бекъп файл."

# --- Дешифратор според разширението и наличния частен ключ ---
decrypt() {  # decrypt <файл> → изсипва открития поток на stdout
  local f="$1"
  case "$f" in
    *.age)
      command -v age >/dev/null 2>&1 || fail "Липсва 'age'."
      [ -n "${AGE_IDENTITY:-}" ] || fail "Задай AGE_IDENTITY (път до частния age ключ)."
      age -d -i "$AGE_IDENTITY" "$f" ;;
    *.gpg)
      command -v gpg >/dev/null 2>&1 || fail "Липсва 'gpg'."
      gpg -d "$f" ;;
    *) fail "Непознато разширение (очаквам .age или .gpg): $f" ;;
  esac
}

verify_sha() {  # проверка на целостта преди дешифриране, ако има .sha256
  local f="$1"
  [ -f "$f.sha256" ] || { log "  (няма $f.sha256 — пропускам проверка на целостта)"; return 0; }
  local want have
  want="$(cat "$f.sha256")"
  if command -v sha256sum >/dev/null 2>&1; then have="$(sha256sum "$f" | awk '{print $1}')"
  else have="$(shasum -a 256 "$f" | awk '{print $1}')"; fi
  [ "$want" = "$have" ] || fail "SHA256 не съвпада за $f — файлът е повреден!"
  log "  ✔ целостта на $(basename "$f") е потвърдена"
}

confirm() {
  [ "$ASSUME_YES" = "1" ] && return 0
  printf '⚠ Това ще ПРЕЗАПИШЕ %s. Продължавам? [пиши: ДА] ' "$1"
  read -r ans; [ "$ans" = "ДА" ] || fail "Отказано."
}

DC exec -T "$DB_SERVICE" pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1 \
  || fail "Услугата '$DB_SERVICE' не отговаря. Вдигни стека първо."

# --- Safety бекъп преди презапис ---
if [ -n "$DB_FILE" ] || [ -n "$UPLOADS_FILE" ]; then
  log "Правя предпазен бекъп на текущото състояние преди възстановяване…"
  AGE_RECIPIENT="${AGE_RECIPIENT:-}" GPG_RECIPIENT="${GPG_RECIPIENT:-}" \
    bash "$SCRIPT_DIR/backup.sh" || log "  (предпазният бекъп не мина — липсва публичен ключ? продължавам)"
fi

# --- Възстановяване на базата ---
if [ -n "$DB_FILE" ]; then
  [ -f "$DB_FILE" ] || fail "Няма такъв файл: $DB_FILE"
  verify_sha "$DB_FILE"
  confirm "базата ($POSTGRES_DB)"
  log "Възстановявам базата от $(basename "$DB_FILE")…"
  # Дъмпът е с --clean --if-exists, тъй че презаписва обектите атомарно.
  decrypt "$DB_FILE" | gunzip \
    | DC exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 >/dev/null \
    || fail "psql restore се провали."
  log "  ✔ базата е възстановена"
fi

# --- Възстановяване на качванията ---
if [ -n "$UPLOADS_FILE" ]; then
  [ -f "$UPLOADS_FILE" ] || fail "Няма такъв файл: $UPLOADS_FILE"
  verify_sha "$UPLOADS_FILE"
  confirm "качванията ($UPLOADS_PATH)"
  log "Възстановявам качванията от $(basename "$UPLOADS_FILE") във volume '$UPLOADS_VOLUME'…"
  # През помощен контейнер (монтира volume-а за запис): изчистваме и разархивираме.
  decrypt "$UPLOADS_FILE" \
    | $DOCKER run --rm -i -v "$UPLOADS_VOLUME":/dst "$HELPER_IMAGE" \
        sh -c 'rm -rf /dst/* /dst/.[!.]* 2>/dev/null; tar -C /dst -xzf -' \
    || fail "Разархивирането на качванията се провали."
  log "  ✔ качванията са възстановени"
fi

log "Готово. При нужда рестартирай: docker compose restart $WEB_SERVICE"
