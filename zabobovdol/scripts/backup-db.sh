#!/usr/bin/env bash
#
# Автоматичен криптиран бекъп на базата (PostgreSQL) за zabobovdol.
#
# Принцип на сигурност (важно):
#   Бекъпите се криптират с ПУБЛИЧЕН ключ (age). На сървъра стои само
#   публичният ключ — с него файловете могат да се КРИПТИРАТ, но НЕ и да
#   се разкриптират. Възстановяване (restore) е възможно само с ЧАСТНИЯ
#   ключ, който държиш единствено ти, офлайн, извън сървъра.
#   Затова дори някой да открадне сървъра и всички бекъпи, не може да ги
#   отвори без твоя частен ключ.
#
# Изход: backups/zabobovdol-YYYYMMDD-HHMMSS.sql.gz.age (+ .sha256)
#
# Употреба:
#   AGE_RECIPIENT="age1...твоят_публичен_ключ..." ./scripts/backup-db.sh
# или сложи AGE_RECIPIENT (или GPG_RECIPIENT) в .env / .backup.env.
#
set -euo pipefail

# --- Локации ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- Зареждане на настройки (без да чупим set -u) ---
load_env() {
  local f="$1"
  [ -f "$f" ] || return 0
  set -a
  # shellcheck disable=SC1090
  . "$f"
  set +a
}
load_env "$ROOT_DIR/.env"
load_env "$ROOT_DIR/.backup.env"   # по избор: тук дръж само AGE_RECIPIENT

# --- Параметри (със стойности по подразбиране от docker-compose.yml) ---
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"     # колко най-нови копия да пазим
DB_SERVICE="${BACKUP_DB_SERVICE:-db}"            # име на услугата в docker compose
POSTGRES_USER="${POSTGRES_USER:-zabobovdol}"
POSTGRES_DB="${POSTGRES_DB:-zabobovdol}"
COMPOSE="${BACKUP_COMPOSE_CMD:-docker compose}"

ts="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/zabobovdol-$ts.sql.gz.age"
tmp="$BACKUP_DIR/.zabobovdol-$ts.sql.gz.partial"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { printf '[ГРЕШКА] %s\n' "$*" >&2; rm -f "$tmp" "$out"; exit 1; }

# --- Избор на метод за криптиране (асиметричен!) ---
ENCRYPT_TOOL=""
if [ -n "${AGE_RECIPIENT:-}" ] && command -v age >/dev/null 2>&1; then
  ENCRYPT_TOOL="age"
elif [ -n "${AGE_RECIPIENTS_FILE:-}" ] && command -v age >/dev/null 2>&1; then
  ENCRYPT_TOOL="age-file"
elif [ -n "${GPG_RECIPIENT:-}" ] && command -v gpg >/dev/null 2>&1; then
  ENCRYPT_TOOL="gpg"
  out="$BACKUP_DIR/zabobovdol-$ts.sql.gz.gpg"
else
  fail "Няма зададен публичен ключ за криптиране.
  Задай AGE_RECIPIENT (препоръчително) и инсталирай 'age',
  или GPG_RECIPIENT и инсталирай 'gpg'.
  Виж scripts/README-backup.md за генериране на ключ."
fi

# --- Проверка, че базата е достъпна ---
log "Проверка на връзката с базата ($DB_SERVICE)…"
$COMPOSE exec -T "$DB_SERVICE" pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1 \
  || fail "Базата не отговаря. Стартирана ли е ($COMPOSE ps)?"

# --- Дъмп → gzip → криптиране (поточно, без некриптиран файл на диска) ---
log "Създаване на криптиран бекъп с метод: $ENCRYPT_TOOL …"
case "$ENCRYPT_TOOL" in
  age)
    $COMPOSE exec -T "$DB_SERVICE" pg_dump -U "$POSTGRES_USER" --no-owner --clean --if-exists "$POSTGRES_DB" \
      | gzip -9 \
      | age -r "$AGE_RECIPIENT" -o "$tmp" \
      || fail "Дъмпът/криптирането се провали."
    ;;
  age-file)
    $COMPOSE exec -T "$DB_SERVICE" pg_dump -U "$POSTGRES_USER" --no-owner --clean --if-exists "$POSTGRES_DB" \
      | gzip -9 \
      | age -R "$AGE_RECIPIENTS_FILE" -o "$tmp" \
      || fail "Дъмпът/криптирането се провали."
    ;;
  gpg)
    $COMPOSE exec -T "$DB_SERVICE" pg_dump -U "$POSTGRES_USER" --no-owner --clean --if-exists "$POSTGRES_DB" \
      | gzip -9 \
      | gpg --batch --yes --trust-model always --encrypt --recipient "$GPG_RECIPIENT" -o "$tmp" \
      || fail "Дъмпът/криптирането се провали."
    ;;
esac

mv "$tmp" "$out"
sha256sum "$out" | awk '{print $1}' > "$out.sha256" 2>/dev/null \
  || shasum -a 256 "$out" | awk '{print $1}' > "$out.sha256"

size="$(du -h "$out" | awk '{print $1}')"
log "Готово: $(basename "$out") ($size)"

# --- Ротация: пази само най-новите $RETENTION_DAYS копия ---
log "Ротация: пазя най-новите $RETENTION_DAYS копия…"
ls -1t "$BACKUP_DIR"/zabobovdol-*.sql.gz.* 2>/dev/null \
  | grep -v '\.sha256$' \
  | tail -n +"$((RETENTION_DAYS + 1))" \
  | while read -r old; do
      log "  изтривам стар: $(basename "$old")"
      rm -f "$old" "$old.sha256"
    done

log "Бекъпът приключи успешно."
