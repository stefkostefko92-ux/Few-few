#!/usr/bin/env bash
#
# Криптиран бекъп на platform: PostgreSQL (service `db`) + томът с качванията
# (`/data/uploads` в контейнера `web`), с ротация.
#
# Принцип на сигурност (важно):
#   Бекъпите се криптират с ПУБЛИЧЕН ключ (age или GPG). На сървъра стои само
#   публичният ключ — с него файловете могат само да се КРИПТИРАТ, не и да се
#   разкриптират. Възстановяване е възможно единствено с ЧАСТНИЯ ключ, който
#   държиш офлайн, извън сървъра. Тъй че дори при кражба на сървъра и бекъпите,
#   те са безполезни без твоя частен ключ.
#
# Двата артефакта на всяко пускане (общ времеви печат):
#   platform-db-YYYYMMDD-HHMMSS.sql.gz.age        (+ .sha256)   ← Postgres дъмп
#   platform-uploads-YYYYMMDD-HHMMSS.tar.gz.age   (+ .sha256)   ← том с качванията
# (при GPG разширението е .gpg вместо .age)
#
# Базата НЯМА публикуван порт (само вътрешна мрежа), затова pg_dump се пуска
# ПРЕЗ `docker compose exec` от хоста — не по TCP. Качванията се архивират през
# помощен busybox контейнер, който монтира named volume-а директно (работи дори
# ако `web` е спрян и не зависи от това дали в web образа има `tar`).
#
# Употреба (от хоста, там където е docker-compose.yml):
#   AGE_RECIPIENT="age1..." bash platform/deploy/backup.sh
# или сложи AGE_RECIPIENT (или GPG_RECIPIENT) в platform/.env / .backup.env.
#
# Cron / systemd timer: виж platform/deploy/systemd/ и DEPLOY.md.
#
set -euo pipefail

# --- Локации ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"     # platform/
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
load_env "$ROOT_DIR/.backup.env"    # по избор: тук дръж само AGE_RECIPIENT

# --- Параметри (по подразбиране съвпадат с docker-compose.yml) ---
# ВАЖНО: по подразбиране пишем ИЗВЪН дървото на проекта (/var/backups/platform).
# autodeploy разгръща всеки релийз в нова папка под /opt/few-few/releases/ и ротира
# старите — ако бекъпите стоят в platform/backups/, ротацията на релийзите ще ги
# трие заедно с кода. Стабилна, независима от релийзите директория е задължителна.
# Подмени с BACKUP_DIR в EnvironmentFile (/etc/platform/backup.env), ако трябва.
BACKUP_DIR="${BACKUP_DIR:-/var/backups/platform}"
RETENTION="${BACKUP_RETENTION:-31}"          # колко най-нови копия (на артефакт) да пазим
DB_SERVICE="${BACKUP_DB_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-platform}"
POSTGRES_DB="${POSTGRES_DB:-platform}"
COMPOSE="${BACKUP_COMPOSE_CMD:-docker compose}"
# Работим спрямо конкретния compose файл — независимо от cwd на cron-а.
COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
DOCKER="${BACKUP_DOCKER_CMD:-docker}"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-busybox}"
DC() { $COMPOSE -f "$COMPOSE_FILE" "$@"; }

# Named volume-ът за качванията: compose го именува <проект>_uploads. Проектът е
# името на папката (platform), освен ако не е override-нат. Авто-засичаме реалното
# име през `compose config`, за да сме издръжливи на COMPOSE_PROJECT_NAME.
detect_uploads_volume() {
  if [ -n "${BACKUP_UPLOADS_VOLUME:-}" ]; then printf '%s' "$BACKUP_UPLOADS_VOLUME"; return; fi
  # `docker compose config --volumes` дава логическите имена; префиксваме с проекта.
  local proj
  proj="$(DC config 2>/dev/null | awk -F': ' '/^name:/{print $2; exit}')"
  [ -n "$proj" ] || proj="$(basename "$ROOT_DIR")"
  printf '%s_uploads' "$proj"
}
UPLOADS_VOLUME="$(detect_uploads_volume)"

ts="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { printf '[ГРЕШКА] %s\n' "$*" >&2; exit 1; }

# --- Избор на метод за криптиране (асиметричен!) ---
ENC_EXT=""
encrypt() { :; }   # ще бъде дефинирана според избора
if [ -n "${AGE_RECIPIENT:-}" ] && command -v age >/dev/null 2>&1; then
  ENC_EXT="age"; encrypt() { age -r "$AGE_RECIPIENT" -o "$1"; }
elif [ -n "${AGE_RECIPIENTS_FILE:-}" ] && command -v age >/dev/null 2>&1; then
  ENC_EXT="age"; encrypt() { age -R "$AGE_RECIPIENTS_FILE" -o "$1"; }
elif [ -n "${GPG_RECIPIENT:-}" ] && command -v gpg >/dev/null 2>&1; then
  ENC_EXT="gpg"; encrypt() { gpg --batch --yes --trust-model always --encrypt --recipient "$GPG_RECIPIENT" -o "$1"; }
else
  fail "Няма зададен публичен ключ за криптиране.
  Задай AGE_RECIPIENT (препоръчително) и инсталирай 'age',
  или GPG_RECIPIENT и инсталирай 'gpg'. Виж platform/deploy/README-backup.md."
fi

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}' > "$1.sha256"
  else
    shasum -a 256 "$1" | awk '{print $1}' > "$1.sha256"
  fi
}

# --- Проверка, че услугите работят ---
log "Проверка, че базата е достъпна…"
DC exec -T "$DB_SERVICE" pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1 \
  || fail "Услугата '$DB_SERVICE' не отговаря. Вдигнат ли е стекът? (docker compose up -d)"

# --- 1) Postgres: pg_dump → gzip → криптиране (поточно, без некриптиран файл) ---
db_out="$BACKUP_DIR/platform-db-$ts.sql.gz.$ENC_EXT"
db_tmp="$BACKUP_DIR/.platform-db-$ts.partial"
log "Дъмп на базата ($POSTGRES_DB) → криптиране ($ENC_EXT)…"
if DC exec -T "$DB_SERVICE" pg_dump -U "$POSTGRES_USER" --no-owner --clean --if-exists "$POSTGRES_DB" \
     | gzip -9 | encrypt "$db_tmp"; then
  mv "$db_tmp" "$db_out"
  checksum "$db_out"
  log "  ✔ $(basename "$db_out") ($(du -h "$db_out" | awk '{print $1}'))"
else
  rm -f "$db_tmp"; fail "Дъмпът/криптирането на базата се провали."
fi

# --- 2) Том с качванията: tar през помощен контейнер → криптиране ---
up_out="$BACKUP_DIR/platform-uploads-$ts.tar.gz.$ENC_EXT"
up_tmp="$BACKUP_DIR/.platform-uploads-$ts.partial"
log "Архив на качванията (volume '$UPLOADS_VOLUME') → криптиране ($ENC_EXT)…"
# Монтираме named volume-а само за четене в busybox и tar-ваме съдържанието му.
# При празен том tar пак дава валиден (празен) gzip поток — не е грешка.
if $DOCKER run --rm -i -v "$UPLOADS_VOLUME":/src:ro "$HELPER_IMAGE" \
     tar -C /src -czf - . \
     | encrypt "$up_tmp"; then
  mv "$up_tmp" "$up_out"
  checksum "$up_out"
  log "  ✔ $(basename "$up_out") ($(du -h "$up_out" | awk '{print $1}'))"
else
  rm -f "$up_tmp"; fail "Архивирането/криптирането на качванията се провали."
fi

# --- 3) Ротация: пази само най-новите $RETENTION копия на всеки артефакт ---
rotate() {
  local pattern="$1"
  ls -1t "$BACKUP_DIR"/$pattern 2>/dev/null \
    | grep -v '\.sha256$' \
    | tail -n +"$((RETENTION + 1))" \
    | while read -r old; do
        log "  ротация — изтривам стар: $(basename "$old")"
        rm -f "$old" "$old.sha256"
      done
}
log "Ротация: пазя най-новите $RETENTION копия на артефакт…"
rotate "platform-db-*.sql.gz.*"
rotate "platform-uploads-*.tar.gz.*"

log "Бекъпът приключи успешно."
