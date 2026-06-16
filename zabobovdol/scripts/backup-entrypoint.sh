#!/bin/sh
#
# Entrypoint за backup контейнера (в docker-compose.yml услуга "backup").
# Прави криптиран бекъп на базата всеки ден в зададен час (по подразбиране 00:00),
# като ползва scripts/backup-db.sh в директен режим (pg_dump по мрежата).
#
# Нужните инструменти (age, GNU date) се инсталират при стартиране.
#
set -u

BACKUP_TIME="${BACKUP_TIME:-00:00}"     # час за ежедневен бекъп (локално за контейнера)
BACKUP_ON_START="${BACKUP_ON_START:-true}"

log() { printf '[backup %s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# --- Еднократна инсталация на нужните пакети (age за криптиране, coreutils за date -d) ---
if ! command -v age >/dev/null 2>&1 || ! date -d "00:00" +%s >/dev/null 2>&1; then
  log "Инсталиране на age, bash, coreutils, gzip…"
  apk add --no-cache age bash coreutils gzip >/dev/null 2>&1 \
    || log "ВНИМАНИЕ: apk add не успя (без интернет?). Ще опитам пак при нужда."
fi

run_backup() {
  log "Стартирам бекъп…"
  if bash /scripts/backup-db.sh; then
    log "Бекъпът приключи успешно."
  else
    log "ГРЕШКА при бекъпа (виж по-горе). Ще опитам отново по график."
  fi
}

# По желание: едно копие веднага при старт, за да се види, че всичко работи.
if [ "$BACKUP_ON_START" = "true" ]; then
  run_backup
fi

# --- Вечен цикъл: чакай до следващия BACKUP_TIME и прави бекъп ---
while true; do
  now="$(date +%s)"
  next="$(date -d "$BACKUP_TIME" +%s 2>/dev/null)"
  if [ -z "$next" ] || [ "$next" -le "$now" ]; then
    next="$(date -d "tomorrow $BACKUP_TIME" +%s 2>/dev/null)"
  fi
  # предпазна мрежа, ако date пак не сработи
  if [ -z "$next" ] || [ "$next" -le "$now" ]; then
    next=$((now + 86400))
  fi
  wait_s=$((next - now))
  log "Следващ бекъп в $BACKUP_TIME (след ~$((wait_s / 3600))ч $(((wait_s % 3600) / 60))мин)."
  sleep "$wait_s"
  run_backup
  sleep 60   # минаваме сигурно покрай целевата минута
done
