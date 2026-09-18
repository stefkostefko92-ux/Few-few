#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-postgres.sh — дневен криптиран бекъп на PostgreSQL базата на Supreme Bot.
#
# Изпълнява договорното обещание в legal/DPA.md §5.1:
#   „Daily PostgreSQL backups, 30-day retention, encrypted at rest.“
#
# Поток:  docker compose exec -T postgres pg_dump -Fc  →  gpg --symmetric (AES-256)
#         → /var/backups/supreme/supreme-YYYYmmdd-HHMM.dump.gpg (mode 600)
#
# Симетрично криптиране с парола от файл (/root/.supreme-backup-pass, mode 600):
# същата парола е нужна и за възстановяване, затова я дръж и ИЗВЪН сървъра
# (мениджър на пароли). Без нея бекъпите са безполезни.
#
# Пуска се от supreme-backup.timer (дневно 03:00 UTC). Логва в journal:
#   journalctl -u supreme-backup.service
#
# Ръчно:
#   sudo /usr/local/sbin/supreme-backup-postgres
#
# Идемпотентен, fail-closed: при неуспешен или подозрително малък дъмп НЕ трие
# нищо старо и излиза с грешка (по-добре стар бекъп, отколкото никакъв).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ╔═ КОНФИГУРАЦИЯ ═════════════════════════════════════════════════════════════
COMPOSE_DIR="${COMPOSE_DIR:-/opt/few-few/current/SupremeDiscordBot}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/supreme}"
PASSPHRASE_FILE="${PASSPHRASE_FILE:-/root/.supreme-backup-pass}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"      # DPA §5.1 — 30 дни задържане
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-1024}"    # под 1KB = провален/празен дъмп
PG_CONTAINER="${PG_CONTAINER:-supremebot_postgres}"
PG_SERVICE="${PG_SERVICE:-postgres}"
VERIFY="${VERIFY:-1}"                       # 1 = разкриптирай обратно за проверка
# По избор: команда за off-site копие (rclone/scp). Изпълнява се best-effort
# със ПЪТЯ на готовия файл като $1. Провал тук НЕ проваля бекъпа.
OFFSITE_CMD="${OFFSITE_CMD:-}"
export GNUPGHOME="${GNUPGHOME:-/root/.gnupg}"
# ╚════════════════════════════════════════════════════════════════════════════

log()  { printf '[%s] ▸ %s\n' "$(date -u +%FT%TZ)" "$*"; }
ok()   { printf '[%s] ✔ %s\n' "$(date -u +%FT%TZ)" "$*"; }
warn() { printf '[%s] ⚠ %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die()  { printf '[%s] ✘ %s\n' "$(date -u +%FT%TZ)" "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Пусни като root (нужен е достъп до docker и до паролата)."
command -v docker >/dev/null || die "Липсва docker."
command -v gpg    >/dev/null || die "Липсва gpg (apt-get install -y gnupg)."

# ── Парола за криптиране ─────────────────────────────────────────────────────
[ -f "$PASSPHRASE_FILE" ] || die "Липсва файл с парола: $PASSPHRASE_FILE
  Създай го ВЕДНЪЖ (и запази паролата и извън сървъра!):
    umask 077; openssl rand -base64 48 > $PASSPHRASE_FILE; chmod 600 $PASSPHRASE_FILE"
[ -s "$PASSPHRASE_FILE" ] || die "Файлът с паролата е празен: $PASSPHRASE_FILE"
perm="$(stat -c '%a' "$PASSPHRASE_FILE" 2>/dev/null || echo '?')"
[ "$perm" = "600" ] || warn "Права $perm на $PASSPHRASE_FILE — трябва да са 600 (chmod 600)."

mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"

# ── Как достигаме до базата: compose (основно) или docker exec (резервно) ────
# Резервният път пази бекъпа жив, ако compose директорията липсва (напр. по време
# на деплой) — контейнерът има фиксирано име в docker-compose.yml.
PG_MODE=""
if [ -d "$COMPOSE_DIR" ] && [ -f "$COMPOSE_DIR/docker-compose.yml" ] && [ -f "$COMPOSE_DIR/.env" ]; then
  PG_MODE="compose"
elif docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  PG_MODE="exec"
  warn "Няма годна compose директория ($COMPOSE_DIR) — ползвам docker exec $PG_CONTAINER."
else
  die "Не намирам работеща база: нито compose в $COMPOSE_DIR, нито контейнер $PG_CONTAINER."
fi

pg_in() {  # изпълнява команда ВЪТРЕ в postgres контейнера (stdin/stdout прозрачни)
  if [ "$PG_MODE" = "compose" ]; then
    ( cd "$COMPOSE_DIR" && docker compose exec -T "$PG_SERVICE" "$@" )
  else
    docker exec -i "$PG_CONTAINER" "$@"
  fi
}

# ── Име на базата и потребителя (.env → контейнер → стойности по подразбиране) ─
env_val() {  # $1 = ключ; чете от COMPOSE_DIR/.env без да изпълнява файла
  [ -f "$COMPOSE_DIR/.env" ] || return 0
  grep -E "^${1}=" "$COMPOSE_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\042\047\r'
}
POSTGRES_USER="${POSTGRES_USER:-$(env_val POSTGRES_USER)}"
POSTGRES_DB="${POSTGRES_DB:-$(env_val POSTGRES_DB)}"
[ -n "$POSTGRES_USER" ] || POSTGRES_USER="$(pg_in printenv POSTGRES_USER 2>/dev/null | tr -d '\r' || true)"
[ -n "$POSTGRES_DB" ]   || POSTGRES_DB="$(pg_in printenv POSTGRES_DB   2>/dev/null | tr -d '\r' || true)"
POSTGRES_USER="${POSTGRES_USER:-bot}"        # default-ите от docker-compose.yml
POSTGRES_DB="${POSTGRES_DB:-discordbot}"

# ── Базата отговаря ли изобщо ────────────────────────────────────────────────
pg_in pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 \
  || die "Базата не отговаря (pg_isready). Стартиран ли е стекът? Бекъп НЕ е направен."

STAMP="$(date -u +%Y%m%d-%H%M)"
OUT="$BACKUP_DIR/supreme-$STAMP.dump.gpg"
TMP="$BACKUP_DIR/.supreme-$STAMP.dump.gpg.partial"
trap 'rm -f "$TMP"' EXIT

gpg_enc() {  # stdin → криптиран файл ($1)
  gpg --batch --yes --quiet --pinentry-mode loopback --no-symkey-cache \
      --passphrase-file "$PASSPHRASE_FILE" \
      --symmetric --cipher-algo AES256 --digest-algo SHA256 --compress-algo zlib \
      -o "$1"
}
gpg_dec() {  # криптиран файл ($1) → stdout
  gpg --batch --yes --quiet --pinentry-mode loopback --no-symkey-cache \
      --passphrase-file "$PASSPHRASE_FILE" --decrypt "$1"
}

# ── Дъмп → криптиране (никога некриптиран файл на диска) ─────────────────────
log "Дъмп на $POSTGRES_DB (потребител $POSTGRES_USER, режим $PG_MODE)…"
umask 077
if ! pg_in pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB" | gpg_enc "$TMP"; then
  rm -f "$TMP"
  die "pg_dump/gpg се провали — НЕ пипам старите бекъпи, НЕ ротирам."
fi

# ── Проверка на резултата (fail-closed: без ротация при съмнение) ────────────
size="$(stat -c '%s' "$TMP" 2>/dev/null || echo 0)"
if [ "$size" -lt "$MIN_DUMP_BYTES" ]; then
  rm -f "$TMP"
  die "Дъмпът е само ${size}B (< ${MIN_DUMP_BYTES}B) — приемам го за провален. Ротация НЕ е извършена."
fi

if [ "$VERIFY" = "1" ]; then
  # Разкриптираме обратно: доказва (а) целостта на файла, (б) че паролата в
  # $PASSPHRASE_FILE наистина отваря бекъпа, (в) че вътре има pg_dump custom
  # формат (магическо „PGDMP“). Бекъп без доказан restore не е бекъп.
  magic="$(gpg_dec "$TMP" 2>/dev/null | head -c 5 || true)"
  [ "$magic" = "PGDMP" ] || { rm -f "$TMP"; die "Съдържанието не е pg_dump custom формат (няма PGDMP). Ротация НЕ е извършена."; }
  plain="$(gpg_dec "$TMP" 2>/dev/null | wc -c)" || plain=0
  [ "$plain" -ge "$MIN_DUMP_BYTES" ] || { rm -f "$TMP"; die "Разкриптираният дъмп е ${plain}B — твърде малък. Ротация НЕ е извършена."; }
  ok "Проверка: файлът се разкриптира с паролата и съдържа валиден дъмп (${plain}B)."
fi

mv "$TMP" "$OUT"
chmod 600 "$OUT"
trap - EXIT
sha256sum "$OUT" | awk '{print $1}' > "$OUT.sha256"
chmod 600 "$OUT.sha256"
ok "Бекъп готов: $OUT ($(du -h "$OUT" | awk '{print $1}'))"

# ── Off-site копие (best-effort; локален диск не е бекъп при загуба на VPS) ──
if [ -n "$OFFSITE_CMD" ]; then
  if "$OFFSITE_CMD" "$OUT"; then ok "Off-site копие изпратено."; else warn "Off-site копието се провали (локалният бекъп е наред)."; fi
fi

# ── Ротация: чак СЛЕД доказано успешен нов бекъп ─────────────────────────────
old_n="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'supreme-*.dump.gpg' -mtime +"$RETENTION_DAYS" | wc -l)"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'supreme-*.dump.gpg' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'supreme-*.dump.gpg.sha256' -mtime +"$RETENTION_DAYS" -delete
log "Ротация (>${RETENTION_DAYS} дни): изтрити $old_n стари бекъпа."

total="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'supreme-*.dump.gpg' | wc -l)"
ok "Налични бекъпи: $total в $BACKUP_DIR"
