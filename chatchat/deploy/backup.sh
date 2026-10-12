#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/backup.sh — дневният шифрован бекъп на ChatChat: базата И прикачените файлове.
#
#   sudo chatchat-backup        # /usr/local/sbin/chatchat-backup; таймерът го пуска всеки ден в 02:45 UTC
#
# Слага го deploy/timers-install.sh (вика го deploy.sh при всеки деплой) заедно с chatchat-backup.timer.
# Възстановяване: deploy/backup-restore.sh (базата) и deploy/files-restore.sh (файловете) — DEPLOY.md, т. 10.
#
# Шифроване: age към получателите в $SHARED/backup-recipients.txt — само ПУБЛИЧНИ ключове. Сървърът
# може да пише бекъпи, но не и да ги чете: откраднат диск, бекъп или off-site копие не издават нищо без
# частния ключ, а той е само при собственика. Затова тук не се разшифрова за проверка; вместо това
# същият поток, който влиза в age, се чете докрай от pg_restore — повреден или непълен дъмп спира
# бекъпа. Целостта на шифрования файл пази самият age (удостоверено шифроване) и .sha256 до него.
#
# Един бекъп = две половини със същия час: chatchat-<час>.dump.age (pg_dump -Fc) и
# chatchat-<час>.files.tar.age (tar на прикачените файлове — те са шифровани и от приложението с
# FILES_KEK, NFR-03: без него архивът е безполезен; ключът се пази ИЗВЪН сървъра и НИКОГА заедно с
# архива — DEPLOY.md, т. 12; пробата за възстановяване проверява разшифроването). Първо базата, после файловете: всеки ред в
# дъмпа сочи файл, който вече е в архива (приложението пише файла преди реда); излишен файл в архива е
# безвреден. Всяка половина е атомична (временен файл → права 600 → fsync → rename). Провал → изход ≠ 0
# и нищо старо не се трие. Некриптирани данни не стъпват на диска. Логът казва само имена, размери и
# броеве — нищо от данните. Ротация: 14 дневни + 8 седмични (двете половини заедно).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${CHATCHAT_SHARED:-/opt/few-few/shared/chatchat}"
DIR="${CHATCHAT_BACKUP_DIR:-$SHARED/backups/daily}"
FILES_DIR="${CHATCHAT_FILES_DIR:-$SHARED/attachments}"
RECIPIENTS="${CHATCHAT_BACKUP_RECIPIENTS:-$SHARED/backup-recipients.txt}"
KEEP_DAILY="${CHATCHAT_BACKUP_DAILY:-14}"
KEEP_WEEKLY="${CHATCHAT_BACKUP_WEEKLY:-8}"
# Празна база дава под 1 KiB, мигрирана без нито един клиент — десетки KiB: под прага е провал.
MIN_BYTES="${CHATCHAT_BACKUP_MIN_BYTES:-8192}"
DB_NAME="${CHATCHAT_DB_NAME:-chatchat}"
DB_USER="${CHATCHAT_DB_USER:-chatchat}"
PROJECT="${CHATCHAT_COMPOSE_PROJECT:-chatchat}"
AGE="${CHATCHAT_AGE:-age}"
FILE_RE='chatchat-[0-9]{8}-[0-9]{6}\.dump\.age'

log() { printf 'chatchat-backup: %s\n' "$*"; }
warn() { printf 'chatchat-backup: ⚠ %s\n' "$*" >&2; }
die() {
  printf 'chatchat-backup: ✘ %s\n' "$*" >&2
  exit 1
}

# Временната папка на текущия запис (само шифровани части и fifo) — трие се при всеки изход.
WORK=""
cleanup() {
  [ -z "$WORK" ] || rm -rf "$WORK"
}
trap cleanup EXIT

# Контейнерът на услугата по етикетите на compose, не по папката на release-а: бекъпът не зависи от
# това кой release е текущ и дали папката му още съществува.
container() {
  local ids
  ids="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=$1")" || return 1
  [ -n "$ids" ] && [ "$(printf '%s\n' "$ids" | wc -l)" = 1 ] || return 1
  printf '%s' "$ids"
}

# Получателите решават кой може да чете бекъпите — подменен файл би ги дал на чужд. Затова: собственик
# е този, който пуска скрипта (root), никой друг не пише в него, и вътре има само публични ключове.
check_recipients() {
  local line
  command -v "$AGE" >/dev/null 2>&1 || die "липсва age (apt-get install -y age) — бекъп НЕ е направен."
  [ -s "$RECIPIENTS" ] ||
    die "няма получател в $RECIPIENTS — бекъп НЕ е направен. Публичният ключ на собственика (age1…) се слага веднъж (DEPLOY.md, т. 9)."
  if grep -q 'AGE-SECRET-KEY-' "$RECIPIENTS"; then
    die "в $RECIPIENTS има ЧАСТЕН ключ — махни го от сървъра (тук е само публичният age1…) и го пази при собственика."
  fi
  [ "$(stat -c %u "$RECIPIENTS")" = "$EUID" ] && [ -z "$(find "$RECIPIENTS" -perm /022)" ] ||
    die "$RECIPIENTS трябва да е на root и само той да пише в него (chown root: … && chmod 600 …)."
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | '#'*) ;;
      age1[0-9a-z]* | 'ssh-ed25519 '* | 'ssh-rsa '*) ;;
      *) die "непознат ред в $RECIPIENTS — очакват се само публични ключове (age1…, ssh-ed25519 …)." ;;
    esac
  done <"$RECIPIENTS"
  grep -Eq '^(age1|ssh-)' "$RECIPIENTS" || die "в $RECIPIENTS няма нито един публичен ключ."
}

# Бекъп и възстановяване не текат едновременно: ключалката е в папката с дневните бекъпи.
lock() {
  install -d -m 700 "$DIR"
  exec 9>"$DIR/.lock"
  flock -n 9 || die "друг бекъп или възстановяване вече тече — опитай по-късно."
}

# Готовият временен файл $1 става $2: права 600, .sha256, fsync, rename (първо файлът, после сумата —
# сума без файл се чисти от ротацията).
publish() {
  local tmp="$1" out="$2" name sum size
  name="$(basename "$out")"
  [ "$(head -n 1 "$tmp")" = 'age-encryption.org/v1' ] || die "$name не е във формата на age — старите не са пипани."
  chmod 600 "$tmp"
  size="$(stat -c %s "$tmp")"
  sum="$(sha256sum "$tmp" | cut -d' ' -f1)"
  printf '%s  %s\n' "$sum" "$name" >"$tmp.sha256"
  sync "$tmp" "$tmp.sha256"
  mv -f "$tmp" "$out"
  mv -f "$tmp.sha256" "$out.sha256"
  sync "$(dirname "$out")"
  log "готов: $name ($((size / 1024)) KiB, sha256 ${sum:0:12}…)"
}

new_work() {
  [ ! -e "$1" ] || die "$(basename "$1") вече съществува — не го презаписвам."
  WORK="$(mktemp -d "$(dirname "$1")/.work.XXXXXX")"
}

done_work() {
  rm -rf "$WORK"
  WORK=""
}

# Дъмп на базата в контейнера $1 → шифрован файл $2, атомично. Проверката чете същия поток успоредно.
dump_to() {
  local cid="$1" out="$2" tmp vpid size
  new_work "$out"
  tmp="$WORK/$(basename "$out")"
  mkfifo "$WORK/check"
  # pg_restore без база само превежда архива в SQL (към /dev/null) — така чете всеки блок до края;
  # отрязан или повреден дъмп завършва с грешка
  docker exec -i "$cid" pg_restore -f /dev/null <"$WORK/check" &
  vpid=$!
  # Причината се взима от статуса на всеки етап (`tee -p` не умира, когато проверката затвори рано).
  local -a st
  local vrc=0
  set +e
  docker exec -i "$cid" pg_dump -Fc -U "$DB_USER" -d "$DB_NAME" |
    tee -p "$WORK/check" | "$AGE" -e -R "$RECIPIENTS" -o "$tmp"
  st=("${PIPESTATUS[@]}")
  wait "$vpid"
  vrc=$?
  set -e
  if [ "${st[0]}" != 0 ] || [ "${st[2]}" != 0 ]; then
    die "pg_dump или age се провали — бекъп НЕ е направен, старите не са пипани."
  fi
  if [ "$vrc" != 0 ] || [ "${st[1]}" != 0 ]; then
    die "дъмпът не се прочете докрай (pg_restore) — повреден или непълен; старите не са пипани."
  fi
  size="$(stat -c %s "$tmp")"
  [ "$size" -ge "$MIN_BYTES" ] ||
    die "бекъпът е само $size B (< $MIN_BYTES B) — празна база или провал; старите не са пипани."
  publish "$tmp" "$out"
  done_work
}

# Прикачените файлове ($FILES_DIR на хоста) → шифрован tar $1, атомично. tar с код 1 („файлът се смени
# по време на четенето“ — приложението пише в момента) дава пак годен архив; по-лошото е провал.
files_to() {
  local out="$1" tmp count
  [ -d "$FILES_DIR" ] || die "няма $FILES_DIR — бекъпът на базата е готов, на файловете НЕ (папката я прави deploy.sh)."
  new_work "$out"
  tmp="$WORK/$(basename "$out")"
  local -a st
  set +e
  tar --numeric-owner -C "$FILES_DIR" -cf - . | "$AGE" -e -R "$RECIPIENTS" -o "$tmp"
  st=("${PIPESTATUS[@]}")
  set -e
  if [ "${st[0]}" -gt 1 ] || [ "${st[1]}" != 0 ]; then
    die "tar или age се провали за прикачените файлове — бекъпът на базата е готов, на файловете НЕ."
  fi
  [ "${st[0]}" = 0 ] || warn "файл се смени по време на архивирането (приложението пише) — архивът е годен."
  count="$(find "$FILES_DIR" -type f | wc -l)"
  publish "$tmp" "$out"
  done_work
  log "прикачени файлове в архива: $count"
}

# Ротация, само след успешен нов бекъп: от всеки ден — най-новият бекъп, за последните $KEEP_DAILY дни с
# бекъп; от всяка ISO седмица — най-новият, за последните $KEEP_WEEKLY седмици. Другото се трие — и двете
# половини. Файлове с чуждо име не се пипат (дъмповете преди миграция са в горната папка).
rotate() {
  local name day week keep days=0 weeks=0 dropped=0 kept=0 f stem
  local -A seen_day=() seen_week=()
  while IFS= read -r name; do
    day="${name:9:8}"
    week="$(date -u -d "$day" +%G-W%V 2>/dev/null)" || continue
    keep=0
    if [ -z "${seen_day[$day]:-}" ]; then
      seen_day[$day]=1
      if [ "$days" -lt "$KEEP_DAILY" ]; then keep=1 && days=$((days + 1)); fi
    fi
    if [ -z "${seen_week[$week]:-}" ]; then
      seen_week[$week]=1
      if [ "$weeks" -lt "$KEEP_WEEKLY" ]; then keep=1 && weeks=$((weeks + 1)); fi
    fi
    if [ "$keep" = 1 ]; then
      kept=$((kept + 1))
    else
      stem="${name%.dump.age}"
      rm -f "$DIR/$name" "$DIR/$name.sha256" "$DIR/$stem.files.tar.age" "$DIR/$stem.files.tar.age.sha256"
      dropped=$((dropped + 1))
    fi
  done < <(find "$DIR" -maxdepth 1 -type f -regextype posix-extended -regex ".*/$FILE_RE" -printf '%f\n' | sort -r)
  # контролна сума без файл (прекъснат запис)
  for f in "$DIR"/chatchat-*.age.sha256; do
    if [ -e "$f" ] && [ ! -e "${f%.sha256}" ]; then rm -f "$f"; fi
  done
  log "ротация: пазя $kept (до $KEEP_DAILY дневни + $KEEP_WEEKLY седмични), изтрих $dropped"
}

backup() {
  local cid stem
  [ "$(id -u)" = 0 ] || die "пусни като root (sudo)."
  check_recipients
  lock
  # остатъци от прекъснат пробег (под ключалката никой друг не пише): само шифровани части и fifo
  find "$DIR" -maxdepth 1 -name '.work.*' -exec rm -rf {} +
  cid="$(container db)" ||
    die "няма работещ контейнер на базата (compose проект $PROJECT, услуга db) — бекъп НЕ е направен."
  stem="$DIR/chatchat-$(date -u +%Y%m%d-%H%M%S)"
  dump_to "$cid" "$stem.dump.age"
  files_to "$stem.files.tar.age"
  rotate
}

# Изпълнен — прави бекъп; зареден със `source` (тестовете, възстановяването) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then backup; fi
