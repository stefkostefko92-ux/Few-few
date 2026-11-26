#!/usr/bin/env bash
# liftcon/deploy/backup.sh — бекъпът на LiftCon (docs/documenti-spec.md D16а, решение на собственика L6-B).
#   дневно:       liftcon-backup.timer (04:10 UTC) → /usr/local/sbin/liftcon-backup (копие; слага го deploy.sh)
#   преди деплой: deploy.sh → backup.sh --deploy (ключалката е вече взета; без работеща база — без дъмп)
#   ръчно:        sudo /usr/local/sbin/liftcon-backup
# 1. Базата: pg_dump от контейнера → gzip → атомично (.partial → mv) в $STATE/backup/db-<време>.sql.gz.
# 2. Файловете на документите (снимки, PDF): моментна снимка с ТВЪРДИ ВРЪЗКИ в $STATE/backup/data-<време>/ —
#    без допълнително място, защото приложението никога не пише върху съществуващ файл (нов файл → rename).
# 3. Срок: всичко в $STATE/backup, по-старо от LIFTCON_BACKUP_GIORNI (30; най-много 30) по времето в името, се
#    трие при всеки изход — и когато 1. или 2. не са минали или ключалката е заета (trap EXIT). С дневното пускане
#    изтритото (документ, снимка, заявка) изчезва от бекъпите най-късно 30 дни след изтриването.
# Списъкът на изтриванията ($STATE/eliminazioni) НЕ влиза в бекъпа: след възстановяване приложението го прилага
# пак при старт. Възстановяване — само с човек: DEPLOY.md.
# Изход: 0 — бекъпът е записан; 1 — провал (какво — на stderr); 2 — грешна употреба или настройка.
set -euo pipefail
umask 077

MODE="daily"
case "${1:-}" in
  "") ;;
  --deploy) MODE="deploy" ;;
  *) printf 'употреба: backup.sh [--deploy]\n' >&2; exit 2 ;;
esac

STATE="${LIFTCON_STATE_DIR:-/opt/few-few/shared/liftcon}"
DIR="$STATE/backup"
DATA_DIR="$STATE/data"
GIORNI="${LIFTCON_BACKUP_GIORNI:-30}"
DB="${LIFTCON_DB_CONTAINER:-liftcon-db-1}"
LOCK="${LIFTCON_LOCK:-/run/lock/liftcon-deploy.lock}"
LOCK_WAIT="${LIFTCON_LOCK_WAIT:-3600}"

log() { printf '[liftcon-backup] %s\n' "$*"; }
err() { printf '[liftcon-backup] ГРЕШКА: %s\n' "$*" >&2; }

case "$GIORNI" in '' | *[!0-9]*) err "LIFTCON_BACKUP_GIORNI трябва да е цяло число от 1 до 30 (тук: $GIORNI)"; exit 2 ;; esac
if ((10#$GIORNI < 1 || 10#$GIORNI > 30)); then
  err "LIFTCON_BACKUP_GIORNI е $GIORNI — политиката за поверителност обещава най-много 30 дни"
  exit 2
fi

case "$LOCK_WAIT" in '' | *[!0-9]*) err "LIFTCON_LOCK_WAIT трябва да е цяло число секунди (тук: $LOCK_WAIT)"; exit 2 ;; esac

install -d -m 700 "$DIR"
ORA="$(date -u +%s)"
TS="$(date -u -d "@$ORA" +%Y%m%dT%H%M%SZ)"
# 3. Срокът — по времето в името (не по mtime: cp -a пази времената на папките). Пази се всичко от последните
#    GIORNI−1 денонощия преди този пуск; с дневното пускане нищо не остава повече от GIORNI дни. Безопасно и без
#    ключалката: трие само изтекли имена, а недовършеният бекъп (.partial) е от този момент.
limite="$(date -u -d "@$((ORA - (10#$GIORNI - 1) * 86400))" +%Y%m%dT%H%M%SZ)"
pota() {
  local p nome stamp
  for p in "$DIR"/db-*.sql.gz "$DIR"/data-*; do
    [[ -e "$p" ]] || continue
    nome="${p##*/}"
    stamp="${nome#*-}"
    stamp="${stamp%%.*}"
    [[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || continue
    if [[ "$stamp" < "$limite" ]]; then
      rm -rf -- "$p"
      log "изтекъл (над $GIORNI дни): $nome"
    fi
  done
}
trap 'pota || true' EXIT

# Един бекъп наведнъж и никога посред деплой (същата ключалка като deploy.sh, който вече я държи при --deploy).
if [[ "$MODE" == daily ]]; then
  exec 9>"$LOCK"
  flock -w "$LOCK_WAIT" 9 || { err "деплой или друг бекъп още тече ($LOCK) — само изтеклите бекъпи се трият"; exit 1; }
fi

rc=0

# Остатък от прекъснат пуск — недовършен бекъп не е бекъп.
find "$DIR" -mindepth 1 -maxdepth 1 -name '*.partial' -exec rm -rf {} +

# 1. Базата. --clean: дъмпът сам маха таблиците при възстановяване (DEPLOY.md).
if docker ps --format '{{.Names}}' | grep -qx "$DB"; then
  f="$DIR/db-$TS.sql.gz"
  if docker exec "$DB" pg_dump -U liftcon -d liftcon --no-owner --clean --if-exists | gzip >"$f.partial"; then
    mv -f "$f.partial" "$f"
    log "база: $f"
  else
    rm -f "$f.partial"
    err "pg_dump не мина"
    rc=1
  fi
elif [[ "$MODE" == deploy ]]; then
  log "базата още не работи (първи деплой) — без дъмп"
else
  err "контейнерът на базата ($DB) не работи — без дъмп"
  rc=1
fi

# 2. Файловете на документите.
if [[ -d "$DATA_DIR" && -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
  s="$DIR/data-$TS"
  if cp -al "$DATA_DIR" "$s.partial" && mv -T "$s.partial" "$s"; then
    log "файлове: $s (твърди връзки)"
  else
    rm -rf "$s.partial"
    err "моментната снимка на файловете не мина"
    rc=1
  fi
fi

if ((rc == 0)); then date -u +%FT%TZ >"$DIR/LAST_OK"; fi
exit "$rc"
