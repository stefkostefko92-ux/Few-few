#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# offsite-backup.sh — нощен бекъп на целия сървър ИЗВЪН машината (restic).
#
# Един сървър без копие другаде е един диск от загубата на всичко. Затова:
#   backup  1) дъмпове на ВСИЧКИ бази през migrate-backup.sh (DUMP_TO): Postgres,
#              MySQL/MariaDB и Redis в контейнер и на хоста, SQLite през backup
#              API — откриват се, не се изброяват на ръка;
#           2) restic backup на същите пътища, които влизат в архива за
#              преместване (конфигурации, /opt, /var/www, томовете без живите
#              бази) + дъмповете — шифровано, с дедупликация;
#           3) restic forget --prune по KEEP_* политиката.
#   verify  restic check (+ прочит на част от данните) и пробно възстановяване на
#           дъмповете от последната снимка: всеки Postgres дъмп минава
#           `pg_restore -l`, всяка SQLite — `PRAGMA integrity_check`. Бекъп без
#           пробно възстановяване е обещание, не бекъп.
#   init    създава хранилището (еднократно).
#   snapshots  списък на снимките на този хост.
#
# Конфиг: /etc/offsite-backup.env (root, 600), редове КЛЮЧ=стойност (не се
# изпълнява като shell — `&` в адрес на Uptime Kuma остава част от адреса):
#   RESTIC_REPOSITORY=sftp:storagebox:restic/<хост>
#   RESTIC_PASSWORD_FILE=/root/.restic-offsite.pass   (копие ИЗВЪН сървъра!)
#   HEALTHCHECK_URL=https://…         по избор: пинг след backup, …/fail при провал
#   HEALTHCHECK_VERIFY_URL=https://…  по избор: същото за verify (отделен адрес —
#                                     успешна проба не бива да скрива провален бекъп)
#   KEEP_DAILY=7 KEEP_WEEKLY=4 KEEP_MONTHLY=6 VERIFY_READ=5%
#
# Пуска се от offsite-backup.timer (нощем) и offsite-verify.timer (седмично).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

ENV_FILE="${ENV_FILE:-/etc/offsite-backup.env}"
DUMP_DIR="${DUMP_DIR:-/var/backups/offsite-dumps}"
MIGRATE="${MIGRATE:-$(dirname "$(readlink -f "$0")")/migrate-backup.sh}"
LOCK_FILE="${LOCK_FILE:-/run/offsite-backup.lock}"
VERIFY_TMP="${VERIFY_TMP:-/var/tmp}"

die(){  printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
ok(){   printf '\033[32m✔ %s\033[0m\n' "$*"; }
inf(){  printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn(){ printf '\033[33m⚠ %s\033[0m\n' "$*" >&2; }

CMD="${1:-}"
case "$CMD" in backup|verify|init|snapshots) ;; *) die "Употреба: $0 backup|verify|init|snapshots";; esac
[ "$(id -u)" -eq 0 ] || die "Пусни като root."
case "$DUMP_DIR" in /?*/*) DUMP_DIR="${DUMP_DIR%/}";; *) die "DUMP_DIR трябва да е абсолютен път поне две нива навътре.";; esac

# Файл, който се изпълнява като root и сочи ключа: само root го пише и чете.
private_file(){
  [ -f "$1" ] || die "Липсва $1."
  [ "$(stat -c %u "$1")" = 0 ] || die "$1 не е на root."
  case "$(stat -c %a "$1")" in 600|400) ;; *) die "$1 трябва да е 600 (сега $(stat -c %a "$1")): chmod 600 $1";; esac
}
# Чете се по ЗАТВОРЕН списък ключове, не със `source`: адресът на Uptime Kuma
# (`…?status=up&msg=OK`) като shell ред пуска присвояването във фона и полето
# остава ПРАЗНО — мъртвецът-ключ мълчи, без нито една грешка. Стойността в
# грешката не се печата: редът може да е тайна.
load_env(){
  local line k v n=0
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue;; esac
    k="${line%%=*}"; v="${line#*=}"
    [ "$k" != "$line" ] || die "$ENV_FILE, ред $n: очаква се КЛЮЧ=стойност."
    case "$v" in \"*\") v="${v:1:${#v}-2}";; \'*\') v="${v:1:${#v}-2}";; esac
    case "$k" in
      HEALTHCHECK_URL|HEALTHCHECK_VERIFY_URL|KEEP_DAILY|KEEP_WEEKLY|KEEP_MONTHLY|VERIFY_READ) printf -v "$k" '%s' "$v";;
      # Променливите на restic и на хранилищата му (S3, B2, Azure, GCS, Swift).
      RESTIC_*|AWS_*|B2_*|AZURE_*|GOOGLE_*|OS_*)
        [[ "$k" =~ ^[A-Z0-9_]+$ ]] || die "$ENV_FILE, ред $n: невалиден ключ."
        export "$k=$v";;
      *) die "$ENV_FILE, ред $n: непознат ключ $k.";;
    esac
  done < "$ENV_FILE"
}
private_file "$ENV_FILE"
load_env
: "${RESTIC_REPOSITORY:?Липсва RESTIC_REPOSITORY в $ENV_FILE}"
[ -n "${RESTIC_PASSWORD_FILE:-}" ] || die "Липсва RESTIC_PASSWORD_FILE в $ENV_FILE."
private_file "$RESTIC_PASSWORD_FILE"
[ -s "$RESTIC_PASSWORD_FILE" ] || die "Ключът $RESTIC_PASSWORD_FILE е празен."
command -v restic >/dev/null 2>&1 || die "Липсва restic: apt-get install -y restic"
KEEP_DAILY="${KEEP_DAILY:-7}"; KEEP_WEEKLY="${KEEP_WEEKLY:-4}"; KEEP_MONTHLY="${KEEP_MONTHLY:-6}"
VERIFY_READ="${VERIFY_READ:-5%}"
for k in KEEP_DAILY KEEP_WEEKLY KEEP_MONTHLY; do
  [[ "${!k}" =~ ^[0-9]+$ ]] || die "$k в $ENV_FILE трябва да е цяло число."
done
# Кешът е извън архивираните пътища, а под systemd HOME може да липсва изобщо.
export RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR:-/var/cache/restic}"
HOST="$(hostname -s 2>/dev/null || hostname)"
TMP=""

# Мъртвецът-ключ: наблюдателят вдига тревога при ЛИПСА на пинг, тоест и когато
# сървърът е мъртъв. `/fail` се вмъква ПРЕДИ заявката — иначе push адрес с
# `?status=up` остава „up“ и провалът се записва като успех.
ping_hc(){
  local u=$1
  [ -n "$u" ] || return 0
  if [ "${2:-}" = fail ]; then case "$u" in *\?*) u="${u%%\?*}/fail?${u#*\?}";; *) u="$u/fail";; esac; fi
  curl -fsS -m 10 --retry 3 -o /dev/null "$u" || warn "Пингът към наблюдателя не мина."
}
# $? се чете ПЪРВО: всяка команда преди това (и rm) би го нулирала и провалът
# щеше да се пингне като успех.
finish(){
  local rc=$? u=""
  if [ -n "$TMP" ]; then rm -rf -- "$TMP"; fi
  case "$CMD" in backup) u="${HEALTHCHECK_URL:-}";; verify) u="${HEALTHCHECK_VERIFY_URL:-}";; esac
  if [ "$rc" -eq 0 ]; then ping_hc "$u"; else ping_hc "$u" fail; fi
}
trap finish EXIT

# backup и verify не вървят едновременно: дъмпът се подменя под краката на
# пробата, а и двете държат хранилището. Таймерите са разминати; това пази от
# ръчно пускане върху нощното.
lock(){
  exec 9>"$LOCK_FILE"
  flock -w 7200 9 || die "Друг offsite-backup върви повече от 2 часа ($LOCK_FILE)."
}

cmd_init(){
  if restic cat config >/dev/null 2>&1; then ok "Хранилището вече съществува: $RESTIC_REPOSITORY"; return 0; fi
  restic init
  ok "Хранилището е създадено. Пази копие на $RESTIC_PASSWORD_FILE ИЗВЪН сървъра — без него снимките не се отварят."
}

cmd_backup(){
  local rc=0 brc=0
  [ -f "$MIGRATE" ] || die "Липсва $MIGRATE."
  lock
  inf "Дъмпове на базите → $DUMP_DIR"
  DUMP_TO="$DUMP_DIR" bash "$MIGRATE" || rc=$?
  case "$rc" in
    0) ;;
    2) warn "Някои дъмпове не минаха (виж по-горе) — снимката се прави с наличното, а задачата завършва с провал." ;;
    *) die "migrate-backup.sh спря с код $rc — снимка без дъмпове не се прави." ;;
  esac
  [ -s "$DUMP_DIR/paths.txt" ] || die "Няма $DUMP_DIR/paths.txt."
  inf "restic backup ($(wc -l < "$DUMP_DIR/paths.txt") пътя)…"
  # --one-file-system: монтираните файлови системи на живите контейнери не се
  # обхождат — иначе всеки контейнер влиза още веднъж като обикновени файлове.
  # --files-from-verbatim: пътят е път, не шаблон (`[` в име не се разгъва).
  restic backup --host "$HOST" --tag nightly --one-file-system --exclude-caches \
    --files-from-verbatim "$DUMP_DIR/paths.txt" --exclude-file "$DUMP_DIR/excludes.txt" || brc=$?
  # 3 = снимката е направена, но част от файловете не се прочетоха (изтрити по
  # време на четене, сокети). Снимката е използваема — предупреждение, не провал.
  case "$brc" in
    0) ok "Снимката е готова." ;;
    3) warn "Снимката е готова, но някои файлове не се прочетоха (restic код 3)." ;;
    *) die "restic backup спря с код $brc." ;;
  esac
  inf "Ротация: ${KEEP_DAILY} дневни · ${KEEP_WEEKLY} седмични · ${KEEP_MONTHLY} месечни…"
  restic forget --host "$HOST" --tag nightly --keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" \
    --keep-monthly "$KEEP_MONTHLY" --prune --quiet
  ok "Бекъпът извън машината приключи."
  [ "$rc" -eq 0 ] || exit 2
}

# Дъмп, който не се отваря, е по-лош от липсващ — изглежда като бекъп.
SQLITE_CHECK='import sqlite3, sys, urllib.parse
c = sqlite3.connect("file:" + urllib.parse.quote(sys.argv[1]) + "?mode=ro", uri=True)
print(c.execute("PRAGMA integrity_check").fetchone()[0])'

cmd_verify(){
  local d n=0 bad=0 f
  lock
  inf "restic check (+ прочит на ${VERIFY_READ} от данните)…"
  restic check --read-data-subset="$VERIFY_READ"
  # Не в /tmp: възстановените дъмпове са ЦЕЛИ бази (лични данни), а /tmp може да е в RAM.
  TMP="$(mktemp -d "$VERIFY_TMP/offsite-verify.XXXXXX")"
  inf "Пробно възстановяване на дъмповете от последната снимка…"
  restic restore latest --host "$HOST" --tag nightly --target "$TMP" --include "$DUMP_DIR" >/dev/null
  d="$TMP$DUMP_DIR"
  [ -f "$d/inventory.txt" ] || die "Последната снимка няма $DUMP_DIR/inventory.txt — бекъпът е ПОД ВЪПРОС."
  if compgen -G "$d/db/*.dump" >/dev/null && ! command -v pg_restore >/dev/null 2>&1; then
    die "Има Postgres дъмпове, а няма pg_restore за проверката: apt-get install -y postgresql-client"
  fi
  for f in "$d"/db/*.dump; do
    [ -e "$f" ] || continue
    n=$((n + 1))
    pg_restore -l "$f" >/dev/null 2>&1 || { warn "Не се чете: ${f##*/}"; bad=$((bad + 1)); }
  done
  for f in "$d"/db/*.sql; do
    [ -e "$f" ] || continue
    case "${f##*/}" in pg-*-globals.sql) continue;; esac
    n=$((n + 1))
    tail -c 200 "$f" | grep -q 'Dump completed' || { warn "Непълен: ${f##*/}"; bad=$((bad + 1)); }
  done
  if [ -d "$d/sqlite" ]; then
    command -v python3 >/dev/null 2>&1 || die "Липсва python3 за проверката на SQLite: apt-get install -y python3"
    while IFS= read -r -d '' f; do
      n=$((n + 1))
      [ "$(python3 -I -c "$SQLITE_CHECK" "$f" 2>/dev/null)" = ok ] \
        || { warn "SQLite не минава проверката: ${f#"$d/sqlite"}"; bad=$((bad + 1)); }
    done < <(find "$d/sqlite" -type f -print0)
  fi
  [ "$n" -gt 0 ] || die "В последната снимка няма нито един дъмп — бекъпът е ПОД ВЪПРОС."
  [ "$bad" -eq 0 ] || die "$bad от $n възстановени дъмпа не минават проверката."
  ok "Пробното възстановяване мина: проверени дъмпове $n, всички се четат."
}

case "$CMD" in
  init) cmd_init;;
  backup) cmd_backup;;
  verify) cmd_verify;;
  snapshots) restic snapshots --host "$HOST";;
esac
