#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fakturist/deploy/backup.sh — дневният бекъп на базата (вика го fakturist-backup.timer, 03:40 UTC).
#
#   sudo bash "$(sudo head -n 1 /opt/few-few/shared/fakturist/last-good)/deploy/backup.sh"   # ръчно
#
# Моделът на rilievi/deploy/backup.sh, без медия (Фактурист пази всичко в PostgreSQL, логата — също).
# 1. Базата: pg_dump от контейнера → gzip → атомично в $SHARED/backups/daily/ (600, папка 700).
# 2. Проверено възстановяване: дъмпът се възстановява във временен PostgreSQL без мрежа; броят редове в
#    "Document" и "AuditLog" трябва да съвпада с дъмпа, а връзките на веригите да са цели
#    (restore-test.sh). Бекъп без проверено възстановяване не е бекъп — провалът е провал на бекъпа.
# 3. Срокът: пазят се последните FAKTURIST_KEEP_DAILY (14), и то не по-стари от
#    FAKTURIST_BACKUP_MAX_DAYS (90 — договорът за обработване, т. 11). Същият таван пази и
#    /etc/cron.daily/fakturist-backups (deploy.sh) — и в дните, в които бекъпът не минава.
# 4. Копие ИЗВЪН сървъра (по избор, препоръчително): FAKTURIST_OFFSITE в $SHARED/backup.env (600) —
#    rsync по SSH само на дъмповете (огледално: изтритото тук по срок изчезва и там). Тайните (.env с
#    LEDGER_SEAL_KEY) скриптът НЕ изнася: копират се веднъж на ръка от собственика — deploy/README.md.
# 5. „Жив съм“: FAKTURIST_HEARTBEAT_URL (Uptime Kuma push и подобни) — пропуснат ден е аларма там;
#    провал — fakturist-backup-alert.service (OnFailure).
# Работи от последния release, който е отговорил (last-good) — там е docker-compose.yml.
# Изход: 0 — дъмпът е записан и проверен; 1 — провал (какво — на stderr).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${FAKTURIST_SHARED:-/opt/few-few/shared/fakturist}"
if [ -f "$SHARED/backup.env" ]; then
  # shellcheck disable=SC1091
  set -a && . "$SHARED/backup.env" && set +a
fi
KEEP="${FAKTURIST_KEEP_DAILY:-14}"
MAX_DAYS="${FAKTURIST_BACKUP_MAX_DAYS:-90}"
VERIFY="${FAKTURIST_BACKUP_VERIFY:-1}"
DIR="$SHARED/backups/daily"

say() { echo "fakturist-backup: $*"; }
fail() {
  echo "fakturist-backup: $*" >&2
  exit 1
}

case "$KEEP" in '' | *[!0-9]* | 0) fail "FAKTURIST_KEEP_DAILY трябва да е цяло число ≥ 1 (тук: $KEEP)" ;; esac
case "$MAX_DAYS" in '' | *[!0-9]*) fail "FAKTURIST_BACKUP_MAX_DAYS трябва да е цяло число (тук: $MAX_DAYS)" ;; esac
# Договорът за обработване (т. 11) обещава най-много 90 дни — по-дълъг срок не се приема.
if [ "$MAX_DAYS" -lt 1 ] || [ "$MAX_DAYS" -gt 90 ]; then
  fail "FAKTURIST_BACKUP_MAX_DAYS е $MAX_DAYS — договорът за обработване позволява 1…90 дни"
fi

# Най-новите първи; всичко след първите $2 — изтрито.
keep_newest() {
  find "$1" -mindepth 1 -maxdepth 1 -name "$3" -printf '%T@ %p\n' | sort -rn |
    tail -n "+$(($2 + 1))" | cut -d' ' -f2- | xargs -r rm -f
}

app="$(head -n 1 "$SHARED/last-good" 2>/dev/null || true)"
if [ -z "$app" ] || [ ! -f "$app/docker-compose.yml" ]; then
  fail "няма работещ release в $SHARED/last-good — няма от какво да се бекъпва"
fi
install -d -m 700 "$SHARED/backups" "$DIR"

# Един бекъп наведнъж (таймерът и ръчното пускане не се застъпват).
exec 9>"$SHARED/backups/.daily.lock"
flock -n 9 || fail "друг бекъп още тече ($SHARED/backups/.daily.lock)"
# Остатък от прекъснат пуск (спрян процес, рестарт) — недовършен дъмп не е копие.
find "$DIR" -maxdepth 1 -name 'fakturist-*.sql.gz.partial' -delete

stamp="$(date -u +%Y%m%d-%H%M%S)"
file="$DIR/fakturist-$stamp.sql.gz"
cd "$app"
if docker compose exec -T db pg_dump --clean --if-exists -U fakturist -d fakturist | gzip >"$file.partial"; then
  mv -f "$file.partial" "$file"
  say "$file ($(du -h "$file" | cut -f1))"
else
  rm -f "$file.partial"
  fail "pg_dump се провали"
fi

# Проверката е ПРЕДИ ротацията: дъмп, който не се възстановява, не изтласква добрите.
if [ "$VERIFY" = "1" ]; then
  bash "$app/deploy/restore-test.sh" "$file" || fail "дъмпът НЕ се възстановява: $file"
else
  say "внимание — без проверка на възстановяването (FAKTURIST_BACKUP_VERIFY=$VERIFY)"
fi

keep_newest "$DIR" "$KEEP" 'fakturist-*.sql.gz'
# Таванът по възраст (договорът за обработване, т. 11) — същият израз като в deploy.sh и cron.daily.
find "$DIR" -maxdepth 1 -name 'fakturist-*.sql.gz' -mtime "+$((MAX_DAYS - 2))" -delete

if [ -n "${FAKTURIST_OFFSITE:-}" ]; then
  ssh_cmd="ssh -o BatchMode=yes ${FAKTURIST_OFFSITE_SSH:-}"
  # Само дъмповете — никога .env, ключалката или недовършен файл.
  rsync -a --delete --include='fakturist-*.sql.gz' --exclude='*' -e "$ssh_cmd" \
    "$DIR/" "$FAKTURIST_OFFSITE/daily/" ||
    fail "копието на дъмповете извън сървъра се провали"
  say "копие извън сървъра: $FAKTURIST_OFFSITE"
else
  say "внимание — няма копие извън сървъра (FAKTURIST_OFFSITE в $SHARED/backup.env, deploy/README.md)"
fi

date -u +%FT%TZ >"$SHARED/backups/LAST_OK"
if [ -n "${FAKTURIST_HEARTBEAT_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$FAKTURIST_HEARTBEAT_URL" ||
    say "внимание — сигналът за живот не стигна до адреса в FAKTURIST_HEARTBEAT_URL"
fi
