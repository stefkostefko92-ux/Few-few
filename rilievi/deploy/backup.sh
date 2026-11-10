#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/backup.sh — дневният бекъп (вика го rilievi-backup.timer, 03:10 UTC).
#
#   sudo bash /opt/few-few/current/rilievi/deploy/backup.sh   # ръчно, по всяко време
#
# 1. Базата: pg_dump от контейнера → gzip → атомично в $SHARED/backups/daily/ (600, папка 700);
#    пазят се последните RILIEVI_KEEP_DAILY (14).
# 2. Снимките и клиповете (`schede/` в тома rilievi_media): моментна снимка с ТВЪРДИ ВРЪЗКИ в
#    $SHARED/backups/media/<дата> — без допълнително място (файловете не се пипат след компресията),
#    а изтритото (снимка, карта, фирма) остава в снимките до 14 дни, като в дъмповете. Томът на друг
#    диск — снимка не се прави (копие би удвоило мястото): тогава пази само копието извън сървъра.
# 3. Проверено възстановяване: дъмпът се възстановява във временен PostgreSQL без мрежа и се броят
#    таблиците и миграциите (restore-test.sh) — бекъп без проверено възстановяване не е бекъп.
# 4. Копие ИЗВЪН сървъра (по избор, препоръчително): RILIEVI_OFFSITE в $SHARED/backup.env (600) —
#    rsync по SSH на дъмповете и на снимките. Тайните (.env с INTERVENTI_SEAL_KEY, който не е в дъмпа)
#    скриптът НЕ изнася: копират се веднъж на ръка от собственика (ключът не се сменя) — DEPLOY.md, т. 6.
# 5. „Жив съм“: RILIEVI_HEARTBEAT_URL (Uptime Kuma push и подобни) — пропуснат ден е аларма там;
#    провал — rilievi-backup-alert.service (OnFailure). DEPLOY.md, т. 6.
# Работи от последния release, който е отговорил (last-good) — там е docker-compose.yml с тайните.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}"
if [ -f "$SHARED/backup.env" ]; then
  # shellcheck disable=SC1091
  set -a && . "$SHARED/backup.env" && set +a
fi
KEEP="${RILIEVI_KEEP_DAILY:-14}"
DIR="$SHARED/backups/daily"
MEDIA="$SHARED/backups/media"
VOLUME="${RILIEVI_MEDIA_VOLUME:-rilievi_media}"
VERIFY="${RILIEVI_BACKUP_VERIFY:-1}"

say() { echo "rilievi-backup: $*"; }
fail() {
  echo "rilievi-backup: $*" >&2
  exit 1
}

# Най-новите първи; всичко след първите $2 — изтрито.
keep_newest() {
  find "$1" -mindepth 1 -maxdepth 1 -name "$3" -printf '%T@ %p\n' | sort -rn |
    tail -n "+$(($2 + 1))" | cut -d' ' -f2- | xargs -r rm -rf
}

app="$(head -n 1 "$SHARED/last-good" 2>/dev/null || true)"
if [ -z "$app" ] || [ ! -f "$app/docker-compose.yml" ]; then
  fail "няма работещ release в $SHARED/last-good — няма от какво да се бекъпва"
fi
install -d -m 700 "$DIR" "$MEDIA"
stamp="$(date -u +%Y%m%d-%H%M%S)"
file="$DIR/rilievi-$stamp.sql.gz"
cd "$app"
if docker compose exec -T db pg_dump --clean --if-exists -U rilievi -d rilievi | gzip >"$file.partial"; then
  mv -f "$file.partial" "$file"
  say "$file ($(du -h "$file" | cut -f1))"
else
  rm -f "$file.partial"
  fail "pg_dump се провали"
fi
keep_newest "$DIR" "$KEEP" 'rilievi-*.sql.gz'

# Снимките: твърди връзки към файловете на тома (същият диск) — копие само на имената.
source_dir="$(docker volume inspect -f '{{.Mountpoint}}' "$VOLUME" 2>/dev/null || true)/schede"
snapshot=""
if [ ! -d "$source_dir" ]; then
  say "без снимки за бекъп ($VOLUME/schede липсва)"
elif [ "$(stat -c %d "$source_dir")" != "$(stat -c %d "$MEDIA")" ]; then
  say "внимание — томът на снимките е на друг диск: без моментна снимка, пази ги копието извън сървъра"
else
  snapshot="$MEDIA/$stamp"
  if ! cp -al "$source_dir" "$snapshot.partial"; then
    rm -rf "$snapshot.partial"
    fail "моментната снимка на снимките се провали"
  fi
  mv "$snapshot.partial" "$snapshot"
  say "$snapshot ($(find "$snapshot" -type f | wc -l) файла)"
  keep_newest "$MEDIA" "$KEEP" '2*'
fi

if [ "$VERIFY" = "1" ]; then
  bash "$app/deploy/restore-test.sh" "$file" || fail "дъмпът НЕ се възстановява: $file"
fi

if [ -n "${RILIEVI_OFFSITE:-}" ]; then
  ssh_cmd="ssh -o BatchMode=yes ${RILIEVI_OFFSITE_SSH:-}"
  rsync -a --delete -e "$ssh_cmd" "$DIR/" "$RILIEVI_OFFSITE/daily/" ||
    fail "копието на дъмповете извън сървъра се провали"
  if [ -d "$source_dir" ]; then
    rsync -a --delete -e "$ssh_cmd" "$source_dir/" "$RILIEVI_OFFSITE/media/" ||
      fail "копието на снимките извън сървъра се провали"
  fi
  say "копие извън сървъра: $RILIEVI_OFFSITE"
else
  say "внимание — няма копие извън сървъра (RILIEVI_OFFSITE в $SHARED/backup.env, DEPLOY.md, т. 6)"
fi

date -u +%FT%TZ >"$SHARED/backups/ULTIMO_OK"
if [ -n "${RILIEVI_HEARTBEAT_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$RILIEVI_HEARTBEAT_URL" ||
    say "внимание — сигналът жив-съм не стигна до ${RILIEVI_HEARTBEAT_URL}"
fi
