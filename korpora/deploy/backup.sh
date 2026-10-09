#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# korpora/deploy/backup.sh — дневният шифрован бекъп на базата на Korpora.
#
#   sudo korpora-backup          # /usr/local/sbin/korpora-backup; таймерът го пуска всеки ден в 02:30 UTC
#
# Слага го deploy/backup-install.sh (вика го deploy.sh при всеки деплой) заедно с korpora-backup.timer.
# Възстановяването е в deploy/backup-restore.sh (DEPLOY.md, т. 10).
#
# Шифроване: age към получателите в $SHARED/backup-recipients.txt — само ПУБЛИЧНИ ключове. Сървърът
# може да пише бекъпи, но не и да ги чете: откраднат диск, бекъп или off-site копие не издават нищо без
# частния ключ, а той е само при собственика. Затова тук не се разшифрова за проверка; вместо това
# същият поток, който влиза в age, се чете докрай от pg_restore — повреден или непълен дъмп спира
# бекъпа. Целостта на шифрования файл пази самият age (удостоверено шифроване: отрязан или променен
# файл не се отваря) и .sha256 до него.
#
# Ред: ключалка → `pg_dump -Fc` в контейнера на базата → едновременно age (във временен файл) и
# проверка с pg_restore → размер и заглавие на age → права 600, fsync, rename → ротация (14 дневни +
# 8 седмични) → таван по възраст за дъмповете в горната папка (cap_age). При провал преди rename:
# изход ≠ 0 и нищо старо не се трие. Некриптиран дъмп не стъпва на диска. Логът казва само имена на
# файлове, размери и броеве — нищо от данните в базата.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${KORPORA_SHARED:-/opt/few-few/shared/korpora}"
DIR="${KORPORA_BACKUP_DIR:-$SHARED/backups/daily}"
RECIPIENTS="${KORPORA_BACKUP_RECIPIENTS:-$SHARED/backup-recipients.txt}"
KEEP_DAILY="${KORPORA_BACKUP_DAILY:-14}"
KEEP_WEEKLY="${KORPORA_BACKUP_WEEKLY:-8}"
# Таванът по възраст за дъмповете в горната папка — същите имена и стойности като в deploy.sh.
PREDEPLOY_DAYS="${KORPORA_PREDEPLOY_DAYS:-30}"
PRERESTORE_DAYS="${KORPORA_PRERESTORE_DAYS:-60}"
# Празна база дава под 1 KiB, мигрирана без нито един акаунт — десетки KiB: под прага е провал.
MIN_BYTES="${KORPORA_BACKUP_MIN_BYTES:-8192}"
DB_NAME="${KORPORA_DB_NAME:-korpora}"
DB_USER="${KORPORA_DB_USER:-korpora}"
PROJECT="${KORPORA_COMPOSE_PROJECT:-korpora}"
AGE="${KORPORA_AGE:-age}"
FILE_RE='korpora-[0-9]{8}-[0-9]{6}\.dump\.age'

log() { printf 'korpora-backup: %s\n' "$*"; }
warn() { printf 'korpora-backup: ⚠ %s\n' "$*" >&2; }
die() {
  printf 'korpora-backup: ✘ %s\n' "$*" >&2
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

# Дъмп на базата в контейнера $1 → шифрован файл $2, атомично. Проверката чете същия поток успоредно.
dump_to() {
  local cid="$1" out="$2" name tmp vpid size sum
  name="$(basename "$out")"
  [ ! -e "$out" ] || die "$name вече съществува — не го презаписвам."
  WORK="$(mktemp -d "$(dirname "$out")/.work.XXXXXX")"
  tmp="$WORK/$name"
  mkfifo "$WORK/check"
  # pg_restore без база само превежда архива в SQL (към /dev/null) — така чете всеки блок до края;
  # отрязан или повреден дъмп завършва с грешка
  docker exec -i "$cid" pg_restore -f /dev/null <"$WORK/check" &
  vpid=$!
  # Причината се взима от статуса на всеки етап, не от реда, в който падат: `tee -p` не умира, когато
  # проверката затвори потока рано (pg_restore отказва архива), затова тогава pg_dump и age завършват,
  # а провалът се вижда само в статуса на проверката. Без -p tee (и pg_dump зад него) падаха от SIGPIPE
  # или не — според това колко е успял да запише преди затварянето, и причината в лога зависеше от времето.
  local -a st
  local vrc=0
  set +e
  # pg_dump само пише — без -i, иначе при `backup-restore.sh --live -` изяжда дъмпа от stdin
  docker exec "$cid" pg_dump -Fc -U "$DB_USER" -d "$DB_NAME" |
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
  [ "$(head -n 1 "$tmp")" = 'age-encryption.org/v1' ] || die "файлът не е във формата на age — старите не са пипани."
  chmod 600 "$tmp"
  sum="$(sha256sum "$tmp" | cut -d' ' -f1)"
  printf '%s  %s\n' "$sum" "$name" >"$tmp.sha256"
  sync "$tmp" "$tmp.sha256"
  # първо самият бекъп, после контролната сума: сума без файл се чисти от ротацията
  mv -f "$tmp" "$out"
  mv -f "$tmp.sha256" "$out.sha256"
  sync "$(dirname "$out")"
  rm -rf "$WORK"
  WORK=""
  log "готов: $name ($((size / 1024)) KiB, sha256 ${sum:0:12}…)"
}

# Ротация, само след успешен нов бекъп: от всеки ден — най-новият файл, за последните $KEEP_DAILY дни с
# бекъп; от всяка ISO седмица — най-новият, за последните $KEEP_WEEKLY седмици. Другото се трие. Файлове
# с чуждо име не се пипат (дъмповете преди миграция са в горната папка и изобщо не са тук).
rotate() {
  local name day week keep days=0 weeks=0 dropped=0 kept=0 f
  local -A seen_day=() seen_week=()
  while IFS= read -r name; do
    day="${name:8:8}"
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
      rm -f "$DIR/$name" "$DIR/$name.sha256"
      dropped=$((dropped + 1))
    fi
  done < <(find "$DIR" -maxdepth 1 -type f -regextype posix-extended -regex ".*/$FILE_RE" -printf '%f\n' | sort -r)
  # контролна сума без бекъп (прекъснат запис)
  for f in "$DIR"/korpora-*.dump.age.sha256; do
    if [ -e "$f" ] && [ ! -e "${f%.sha256}" ]; then rm -f "$f"; fi
  done
  log "ротация: пазя $kept (до $KEEP_DAILY дневни + $KEEP_WEEKLY седмични), изтрих $dropped"
}

# Таванът по възраст и между два деплоя (deploy.sh го налага само при деплой): некриптираните
# pre-deploy-*.sql.gz над $PREDEPLOY_DAYS дни и шифрованите снимки преди възстановяване (със сумите им)
# над $PRERESTORE_DAYS дни. Тук и най-новият дъмп — откат към него би загубил вече месец данни; дневните
# бекъпи го покриват. Само след успешен нов бекъп; провалът е предупреждение — бекъпът вече е готов.
cap_age() {
  find "$SHARED/backups" -maxdepth 1 -type f \( -name 'pre-deploy-*.sql.gz' -mtime "+$PREDEPLOY_DAYS" \
    -o -name 'pre-restore-*.dump.age' -mtime "+$PRERESTORE_DAYS" \
    -o -name 'pre-restore-*.dump.age.sha256' -mtime "+$PRERESTORE_DAYS" \) -delete ||
    warn "старите дъмпове в $SHARED/backups не се изтриха — следващият пробег опитва пак"
}

backup() {
  local cid
  [ "$(id -u)" = 0 ] || die "пусни като root (sudo)."
  check_recipients
  lock
  # остатъци от прекъснат пробег (под ключалката никой друг не пише): само шифровани части и fifo
  find "$DIR" -maxdepth 1 -name '.work.*' -exec rm -rf {} +
  cid="$(container db)" ||
    die "няма работещ контейнер на базата (compose проект $PROJECT, услуга db) — бекъп НЕ е направен."
  dump_to "$cid" "$DIR/korpora-$(date -u +%Y%m%d-%H%M%S).dump.age"
  rotate
  cap_age
}

# Изпълнен — прави бекъп; зареден със `source` (тестовете, backup-restore.sh) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then backup; fi
