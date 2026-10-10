#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/pgdata-encrypt.sh — данните на PostgreSQL на ChatChat в шифрован том (LUKS2):
# NFR-03, §15.1 „cifratura at-rest dei dati“. Прикачените файлове се шифроват отделно, в
# приложението (FILES_KEK, src/storage/envelope.ts). Модел на заплахата и процедури — DEPLOY.md, т. 12.
#
#   R="$(cat /opt/few-few/shared/chatchat/last-good)"
#   sudo bash "$R/deploy/pgdata-encrypt.sh" enable   # веднъж, идемпотентно: ключ, том, ext4, unit и
#                                                     # миграция на базата от тома db-data
#   sudo chatchat-pgdata status                      # режим, носител, отключен/монтиран
#   sudo chatchat-pgdata open | close                # ръчно отключване (+ пуска базата и app) / заключване
#   sudo chatchat-pgdata rotate-key                  # нов ключов файл: luksAddKey → проба → luksRemoveKey
#   sudo chatchat-pgdata manual-unlock               # по-строго: парола при всеки рестарт, без ключов файл
#   sudo chatchat-pgdata auto-unlock                 # обратно към ключовия файл
#
# Носител: CHATCHAT_PGDATA_DEVICE=/dev/disk/by-id/… (Hetzner Volume — само ПРАЗЕН: без файлова система
# и дялове) или, без него, файл $SHARED/pgdata.luks (sparse, CHATCHAT_PGDATA_SIZE, по подразбиране 20G).
# Ключ: /etc/chatchat/pgdata.key (0400 root, 64 случайни байта от openssl). Монтиране: $SHARED/pgdata
# (nodev,nosuid,noexec); базата — в $SHARED/pgdata/data през docker-compose.pgdata.yml (COMPOSE_FILE в
# .env): bind без create_host_path — незаключен том = базата на ChatChat НЕ тръгва (никога празна база
# върху некриптирания диск). Конфигът (носител, UUID, режим, състояние) — /etc/chatchat/pgdata.conf.
#
# Миграцията е без загуба: app спира (нищо не пише) → броеве на редовете + одитната верига →
# pg_dump в шифрования том → дъмпът се чете докрай → db спира → compose минава на шифрования том →
# нов клъстер → pg_restore (една транзакция) → същите броеве и верига → app тръгва. Грешка след спирането
# на app → автоматично връщане на стария том. Старият том (chatchat_db-data) остава до ръчно изтриване.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SELF="$(readlink -f "${BASH_SOURCE[0]}")"
APP_DIR="$(cd "$(dirname "$SELF")/.." && pwd)"
SHARED="${CHATCHAT_SHARED:-/opt/few-few/shared/chatchat}"
CONF_DIR="${CHATCHAT_PGDATA_CONF_DIR:-/etc/chatchat}"
CONF="$CONF_DIR/pgdata.conf"
KEY="$CONF_DIR/pgdata.key"
DEVICE="${CHATCHAT_PGDATA_DEVICE:-}"
FILE="${CHATCHAT_PGDATA_FILE:-$SHARED/pgdata.luks}"
SIZE="${CHATCHAT_PGDATA_SIZE:-20G}"
SYSTEMD_DIR="${CHATCHAT_SYSTEMD_DIR:-/etc/systemd/system}"
SBIN="${CHATCHAT_SBIN:-/usr/local/sbin}"
OLD_VOLUME="${CHATCHAT_DB_VOLUME:-chatchat_db-data}"
# Резерв над 2 × базата при проверката на мястото (по подразбиране 1 GiB).
MARGIN="${CHATCHAT_PGDATA_MARGIN_BYTES:-1073741824}"
PROJECT="${CHATCHAT_COMPOSE_PROJECT:-chatchat}"
COMPOSE_LINE='COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml'
TS="$(date -u +%Y%m%d-%H%M%S)"
# Стойностите от конфига (load_conf) — подразбиранията са за първото пускане.
MAPPER="chatchat-pgdata" MOUNT="$SHARED/pgdata" MODE="keyfile" BACKING="" SOURCE="" UUID="" FS="" STATE=""
ROLLBACK=0 DUMP=""

log() { printf '\033[1;36m▸ chatchat-pgdata: %s\033[0m\n' "$*"; }
ok() { printf '\033[32m✔ chatchat-pgdata: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ chatchat-pgdata: %s\033[0m\n' "$*" >&2; }
die() {
  printf '\033[31m✘ chatchat-pgdata: %s\033[0m\n' "$*" >&2
  exit 1
}

require_root() { [ "$(id -u)" = 0 ] || die "пусни като root (sudo)."; }

# ── конфигът: KEY=стойност, чете се със sed (никога `source`), пише се атомарно (600) ──────────────
conf_get() {
  [ -f "$CONF" ] || return 0
  sed -n "s/^$1=//p" "$CONF" | tail -n 1
}

conf_set() {
  local tmp
  install -d -m 700 "$CONF_DIR"
  tmp="$(mktemp "$CONF_DIR/.pgdata.conf.XXXXXX")"
  { if [ -f "$CONF" ]; then grep -v "^$1=" "$CONF" || true; fi; printf '%s=%s\n' "$1" "$2"; } >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$CONF"
}

load_conf() {
  local v name
  for name in MAPPER MOUNT MODE BACKING SOURCE UUID FS STATE; do
    v="$(conf_get "$name")"
    if [ -n "$v" ]; then printf -v "$name" '%s' "$v"; fi
  done
  DATA="$MOUNT/data"
}
DATA="$MOUNT/data"

need_conf() {
  [ -f "$CONF" ] || die "няма $CONF — шифрованият том не е настроен (DEPLOY.md, т. 12)."
  load_conf
}

# Едно пускане наведнъж (enable/ротация/режим) — ключалката е до конфига.
lock() {
  install -d -m 700 "$CONF_DIR"
  exec 8>"$CONF_DIR/.lock"
  flock -n 8 || die "друг chatchat-pgdata вече тече — опитай по-късно."
}

# Обвивки — заместват се в тестовете (истински диск не се пипа никога извън сървъра).
is_block() { [ -b "$1" ]; }
make_fs() { mkfs.ext4 -q -L chatchat-pgdata -m 1 "$1"; }
is_open() { cryptsetup status "$MAPPER" >/dev/null 2>&1; }
is_mounted() { mountpoint -q "$MOUNT"; }

# ── ключът ────────────────────────────────────────────────────────────────────────────────────────
# Създава се веднъж; никога не се печата. Загубен ключ = загубен том (бекъпът на базата остава).
ensure_key() {
  [ "$MODE" != manual ] || return 0
  if [ -s "$KEY" ]; then
    chmod 400 "$KEY"
    return 0
  fi
  install -d -m 700 "$CONF_DIR"
  rm -f "$KEY.tmp"
  openssl rand -out "$KEY.tmp" 64 || die "openssl не създаде ключа."
  chmod 400 "$KEY.tmp"
  mv -f "$KEY.tmp" "$KEY"
  warn "нов ключ $KEY — копирай го ИЗВЪН сървъра сега (base64 $KEY → password manager), отделно от бекъпите на базата."
}

# ── носителят ─────────────────────────────────────────────────────────────────────────────────────
pick_source() {
  if [ -n "$SOURCE" ]; then
    [ -z "$DEVICE" ] || [ "$DEVICE" = "$SOURCE" ] ||
      die "в $CONF носителят е $SOURCE, а CHATCHAT_PGDATA_DEVICE=$DEVICE — смяната на носителя не става оттук."
    return 0
  fi
  if [ -n "$DEVICE" ]; then BACKING=device SOURCE="$DEVICE"; else BACKING=file SOURCE="$FILE"; fi
}

# Нов LUKS2 само върху ПРАЗЕН носител: нов sparse файл или устройство без нито един подпис.
ensure_luks() {
  local rc=0
  if cryptsetup isLuks "$SOURCE" 2>/dev/null; then return 0; fi
  if [ "$BACKING" = file ]; then
    [ ! -s "$SOURCE" ] || die "$SOURCE съществува и не е LUKS — не го пипам."
    install -d -m 700 "$(dirname "$SOURCE")"
    truncate -s "$SIZE" "$SOURCE" || die "файлът $SOURCE ($SIZE) не се създаде."
    chmod 600 "$SOURCE"
  else
    is_block "$SOURCE" || die "$SOURCE не е блоково устройство (очаква се /dev/disk/by-id/…)."
    blkid -p "$SOURCE" >/dev/null 2>&1 || rc=$?
    case "$rc" in
      2) ;;
      0) die "на $SOURCE има файлова система или дялове — не го форматирам. Ако СИГУРНО е празен: umount, махни реда от /etc/fstab, wipefs -a $SOURCE (DEPLOY.md, т. 12)." ;;
      *) die "blkid не разчете $SOURCE (код $rc) — не го пипам." ;;
    esac
  fi
  log "LUKS2 върху $SOURCE…"
  cryptsetup luksFormat --batch-mode --type luks2 --cipher aes-xts-plain64 --key-size 512 \
    --hash sha256 --pbkdf argon2id --label chatchat-pgdata --key-file "$KEY" "$SOURCE" ||
    die "luksFormat се провали."
  conf_set FS pending
  FS=pending
}

# UUID-ът от конфига пази от грешно устройство (друг том на същия път).
check_uuid() {
  local now
  [ -n "$UUID" ] || return 0
  now="$(cryptsetup luksUUID "$SOURCE" 2>/dev/null)" || die "$SOURCE не е LUKS том."
  [ "$now" = "$UUID" ] || die "на $SOURCE е друг LUKS том ($now ≠ $UUID) — не го отключвам."
}

open_volume() {
  if is_open; then return 0; fi
  check_uuid
  if [ "$MODE" = manual ]; then
    [ -t 0 ] || die "ръчен режим: паролата се въвежда в терминал — sudo chatchat-pgdata open"
    cryptsetup open --type luks2 "$SOURCE" "$MAPPER" || die "томът не се отключи."
  else
    [ -s "$KEY" ] || die "няма ключ $KEY — върни го от бекъпа (DEPLOY.md, т. 12)."
    cryptsetup open --type luks2 --key-file "$KEY" "$SOURCE" "$MAPPER" || die "ключът не отключи $SOURCE."
  fi
}

# ext4 само в току-що създаден том (FS=pending); непознато съдържание не се пипа.
ensure_fs() {
  local dev="/dev/mapper/$MAPPER" rc=0 type
  type="$(blkid -p -o value -s TYPE "$dev" 2>/dev/null)" || rc=$?
  case "$rc" in
    0) [ "$type" = ext4 ] || die "в шифрования том има $type, не ext4 — не го пипам." ;;
    2)
      [ "$FS" = pending ] || die "шифрованият том е празен, а не е току-що създаден — нужен е човек (DEPLOY.md, т. 12)."
      make_fs "$dev" || die "ext4 не се създаде."
      ;;
    *) die "blkid не разчете шифрования том (код $rc)." ;;
  esac
  if [ "$FS" != ext4 ]; then
    conf_set FS ext4
    FS=ext4
  fi
}

mount_volume() {
  install -d -m 700 "$MOUNT"
  if ! is_mounted; then
    mount -o nodev,nosuid,noexec "/dev/mapper/$MAPPER" "$MOUNT" || die "томът не се монтира на $MOUNT."
  fi
  is_mounted || die "$MOUNT не е монтиран."
  chmod 700 "$MOUNT"
}

# ── systemd ───────────────────────────────────────────────────────────────────────────────────────
install_unit() {
  local src="$APP_DIR/deploy/systemd/chatchat-pgdata.service" dst="$SYSTEMD_DIR/chatchat-pgdata.service" tmp
  if ! command -v systemctl >/dev/null 2>&1 || [ ! -d "$SYSTEMD_DIR" ]; then
    warn "няма systemd — след рестарт: sudo chatchat-pgdata open"
    return 0
  fi
  [ -f "$src" ] || die "няма $src в release-а."
  [[ "$SHARED$CONF_DIR$SBIN" =~ ^[A-Za-z0-9._/-]+$ ]] || die "необичаен път — unit-ът не е сложен."
  if ! cmp -s "$SELF" "$SBIN/chatchat-pgdata"; then install -m 700 "$SELF" "$SBIN/chatchat-pgdata"; fi
  tmp="$(mktemp)"
  sed -e "s#/opt/few-few/shared/chatchat#$SHARED#g" -e "s#/etc/chatchat#$CONF_DIR#g" \
    -e "s#/usr/local/sbin#$SBIN#g" "$src" >"$tmp"
  if ! cmp -s "$tmp" "$dst"; then
    install -m 644 "$tmp" "$dst"
    systemctl daemon-reload || warn "systemctl daemon-reload не мина."
  fi
  rm -f "$tmp"
  systemctl enable chatchat-pgdata.service >/dev/null || die "chatchat-pgdata.service не се включи."
}

# ── compose: редът COMPOSE_FILE в .env (стабилният и този на release-а) ───────────────────────────
env_files() { printf '%s\n' "$SHARED/.env" "$APP_DIR/.env"; }

set_compose_line() {
  local f
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    grep -qxF "$COMPOSE_LINE" "$f" && continue
    { grep -v '^COMPOSE_FILE=' "$f" || true; printf '%s\n' "$COMPOSE_LINE"; } >"$f.tmp"
    chmod 600 "$f.tmp" && mv -f "$f.tmp" "$f"
  done < <(env_files)
}

unset_compose_line() {
  local f
  while IFS= read -r f; do
    if [ ! -f "$f" ] || ! grep -q '^COMPOSE_FILE=' "$f"; then continue; fi
    { grep -v '^COMPOSE_FILE=' "$f" || true; } >"$f.tmp"
    chmod 600 "$f.tmp" && mv -f "$f.tmp" "$f"
  done < <(env_files)
}

# ── базата ────────────────────────────────────────────────────────────────────────────────────────
psql_db() { docker compose exec -T db psql -X -q -tA -v ON_ERROR_STOP=1 -U chatchat -d chatchat -c "$1"; }

# Точен брой редове на всяка таблица + одитната верига (брой, md5 на prevHash>hash по ред). Само
# имена на таблици и числа — никакви данни.
FINGERPRINT_SQL="$(
  cat <<'SQL'
SELECT table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text
FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'audit=' || count(*) || ':' || coalesce(md5(string_agg("prevHash" || '>' || hash, ',' ORDER BY id)), '-') FROM "AuditEvent"
ORDER BY 1
SQL
)"

fingerprint() { psql_db "$FINGERPRINT_SQL"; }

# Място: дъмп + нова база ≈ 2 × сегашната + резерв (1 GiB) — в тома, а за файл — и на диска под него.
check_space() {
  local db need avail
  db="$(psql_db 'SELECT pg_database_size(current_database())' | tr -dc '0-9')"
  [ -n "$db" ] || die "размерът на базата не се прочете."
  need=$((db * 2 + MARGIN))
  avail="$(df -B1 --output=avail "$MOUNT" | tail -n 1 | tr -dc '0-9')"
  [ "${avail:-0}" -ge "$need" ] || die "в шифрования том има $avail B, трябват ≥ $need B (2 × базата + резерв) — по-голям CHATCHAT_PGDATA_SIZE/том."
  if [ "$BACKING" = file ]; then
    avail="$(df -B1 --output=avail "$(dirname "$SOURCE")" | tail -n 1 | tr -dc '0-9')"
    [ "${avail:-0}" -ge "$need" ] || die "на диска под $SOURCE има $avail B, трябват ≥ $need B (файлът е sparse и расте)."
  fi
}

# Връщане на стария том при всяка грешка след спирането на приложението (trap EXIT).
rollback() {
  local rc=$?
  [ "$ROLLBACK" = 1 ] || return 0
  ROLLBACK=0
  warn "връщам базата на стария том ($OLD_VOLUME)…"
  docker compose stop db >/dev/null 2>&1 || true
  unset_compose_line
  if [ -d "$DATA" ]; then mv "$DATA" "$MOUNT/data.failed-$TS" 2>/dev/null || true; fi
  docker compose up -d --wait db >/dev/null || warn "старата база не тръгна — нужен е човек: cd $APP_DIR && docker compose logs db"
  docker compose up -d >/dev/null || warn "приложението не тръгна — cd $APP_DIR && docker compose up -d"
  warn "миграцията е върната: базата работи от $OLD_VOLUME, нищо не е изгубено. Шифрованият том остава (дъмп: ${DUMP:-няма})."
  exit "$((rc == 0 ? 1 : rc))"
}

migrate_db() {
  local before after
  cd "$APP_DIR"
  [ -f "$APP_DIR/.env" ] || die "няма $APP_DIR/.env — пусни от папката на работещия release (deploy.sh я слага)."
  is_mounted || die "$MOUNT не е монтиран."
  # Остатък от провален опит — настрана, не се трие.
  if [ -d "$DATA" ] && [ -n "$(ls -A "$DATA")" ]; then
    mv "$DATA" "$MOUNT/data.failed-$TS"
    warn "остатък от предишен опит → $MOUNT/data.failed-$TS (изтрий го на ръка)"
  fi
  unset_compose_line
  log "базата на стария том — за дъмпа…"
  docker compose up -d --no-recreate --wait db >/dev/null || die "базата не тръгна — нищо не е пипано."
  check_space

  ROLLBACK=1
  trap rollback EXIT
  log "спирам приложението (нищо не пише по време на миграцията)…"
  docker compose stop app >/dev/null || die "приложението не спря."
  before="$(fingerprint)" || die "броевете преди миграцията не се прочетоха."
  [ -n "$before" ] || die "празни броеве преди миграцията."
  install -d -m 700 "$MOUNT/migration"
  DUMP="$MOUNT/migration/pre-luks-$TS.dump"
  docker compose exec -T db pg_dump -Fc -U chatchat -d chatchat >"$DUMP.partial" || die "pg_dump се провали."
  mv -f "$DUMP.partial" "$DUMP"
  chmod 600 "$DUMP"
  # Дъмпът се чете докрай (съдържанието и всеки блок), преди да спре старата база.
  docker compose exec -T db pg_restore -l <"$DUMP" >/dev/null || die "дъмпът няма годно съдържание."
  docker compose exec -T db pg_restore -f /dev/null <"$DUMP" || die "дъмпът не се прочете докрай."
  log "дъмпът е проверен ($(du -h "$DUMP" | cut -f1)); базата минава на шифрования том…"
  docker compose stop db >/dev/null || die "старата база не спря."
  set_compose_line
  install -d -m 700 "$DATA"
  docker compose up -d --wait db >/dev/null || die "базата не тръгна в шифрования том."
  docker compose exec -T db pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
    -U chatchat -d chatchat <"$DUMP" || die "възстановяването в шифрования том се провали."
  after="$(fingerprint)" || die "броевете след миграцията не се прочетоха."
  [ "$before" = "$after" ] || die "броевете на редовете или одитната верига НЕ съвпадат след възстановяването."
  conf_set STATE encrypted
  conf_set MIGRATED_AT "$TS"
  STATE=encrypted
  ROLLBACK=0
  trap - EXIT
  ok "базата е в шифрования том: $(printf '%s\n' "$after" | wc -l) реда на проверката съвпадат (таблици + одитна верига)"
  docker compose up -d >/dev/null || warn "приложението не тръгна — cd $APP_DIR && docker compose up -d"
  move_plain_dumps
  remind_old_volume
}

# Нешифрованите дъмпове отпреди деплой (deploy.sh) — в шифрования том; оттук нататък deploy.sh пише там.
move_plain_dumps() {
  local f n=0
  install -d -m 700 "$MOUNT/pre-deploy"
  for f in "$SHARED/backups"/pre-deploy-*.sql.gz; do
    [ -e "$f" ] || continue
    mv -f "$f" "$MOUNT/pre-deploy/" && n=$((n + 1))
  done
  [ "$n" = 0 ] || warn "$n нешифровани дъмпа отпреди деплой → $MOUNT/pre-deploy (освободените блокове на стария диск не са презаписани)."
}

remind_old_volume() {
  if docker volume inspect "$OLD_VOLUME" >/dev/null 2>&1; then
    warn "старият НЕшифрован том $OLD_VOLUME се пази до ръчно изтриване — след проверка: docker volume rm $OLD_VOLUME"
  fi
}

init_fresh() {
  is_mounted || die "$MOUNT не е монтиран."
  install -d -m 700 "$DATA"
  set_compose_line
  conf_set STATE encrypted
  STATE=encrypted
  ok "нова база: ще се създаде направо в шифрования том при следващия deploy.sh"
}

# ── команди ───────────────────────────────────────────────────────────────────────────────────────
cmd_enable() {
  local t
  require_root
  for t in cryptsetup blkid mount umount mountpoint openssl truncate flock; do
    command -v "$t" >/dev/null 2>&1 || die "липсва $t (apt-get install -y cryptsetup)."
  done
  [ -f "$APP_DIR/docker-compose.pgdata.yml" ] ||
    die "enable се пуска от папката на release-а: bash <release>/chatchat/deploy/pgdata-encrypt.sh enable"
  docker compose version >/dev/null 2>&1 || die "липсва Docker с compose plugin."
  lock
  load_conf
  pick_source
  if [ "$MODE" != manual ] && [ ! -s "$KEY" ] && cryptsetup isLuks "$SOURCE" 2>/dev/null; then
    die "томът $SOURCE съществува, а ключът $KEY липсва — върни ключа от бекъпа; нов ключ НЕ отваря стария том."
  fi
  ensure_key
  ensure_luks
  conf_set MAPPER "$MAPPER"
  conf_set MOUNT "$MOUNT"
  conf_set MODE "$MODE"
  conf_set BACKING "$BACKING"
  conf_set SOURCE "$SOURCE"
  if [ -z "$UUID" ]; then
    UUID="$(cryptsetup luksUUID "$SOURCE")" || die "UUID на тома не се прочете."
    conf_set UUID "$UUID"
  fi
  open_volume
  ensure_fs
  mount_volume
  install_unit
  if [ "$STATE" = encrypted ]; then
    set_compose_line
    ok "данните на базата вече са в шифрования том ($SOURCE → $MOUNT)"
    remind_old_volume
    return 0
  fi
  if docker volume inspect "$OLD_VOLUME" >/dev/null 2>&1; then migrate_db; else init_fresh; fi
}

# Контейнерите на ChatChat по етикетите на compose (без папката на release-а).
compose_ids() {
  docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=$1" 2>/dev/null | head -n 1
}

cmd_open() {
  local id svc
  require_root
  need_conf
  if [ "${1:-}" = --boot ] && [ "$MODE" = manual ]; then
    warn "ръчен режим: базата на ChatChat чака паролата — sudo chatchat-pgdata open"
    return 0
  fi
  open_volume
  mount_volume
  [ -d "$DATA" ] || warn "няма $DATA — базата още не е минала в шифрования том (enable)."
  ok "отключен и монтиран на $MOUNT"
  # При старт на машината Docker още не тече — той пуска контейнерите сам; ръчно — пускаме ги тук.
  [ "${1:-}" != --boot ] || return 0
  docker info >/dev/null 2>&1 || return 0
  for svc in db app; do
    id="$(compose_ids "$svc")"
    [ -z "$id" ] || docker start "$id" >/dev/null || warn "контейнерът $svc не тръгна — cd \$(cat $SHARED/last-good) && docker compose up -d"
  done
}

cmd_close() {
  local id svc
  require_root
  need_conf
  if [ "${1:-}" != --boot ] && docker info >/dev/null 2>&1; then
    for svc in app db; do
      id="$(compose_ids "$svc")"
      [ -z "$id" ] || docker stop "$id" >/dev/null || die "контейнерът $svc не спря — томът остава монтиран."
    done
  fi
  if is_mounted; then umount "$MOUNT" || die "$MOUNT не се демонтира (кой го ползва: fuser -vm $MOUNT)."; fi
  if is_open; then cryptsetup close "$MAPPER" || die "томът не се заключи."; fi
  ok "заключен"
}

cmd_status() {
  if [ ! -f "$CONF" ]; then
    printf 'шифрован том на базата: не е настроен (DEPLOY.md, т. 12)\n'
    return 0
  fi
  load_conf
  printf 'режим: %s\nносител: %s (%s)\nсъстояние: %s\nотключен: %s\nмонтиран: %s (%s)\n' \
    "$MODE" "$SOURCE" "$BACKING" "${STATE:-не е мигриран}" \
    "$(is_open && echo да || echo не)" "$(is_mounted && echo да || echo не)" "$MOUNT"
}

# Нов ключов файл: добавя се (с разрешението на стария), проверява се, старият слот се маха.
cmd_rotate_key() {
  require_root
  need_conf
  lock
  [ "$MODE" != manual ] || die "ръчен режим: паролата се сменя с cryptsetup luksChangeKey $SOURCE"
  [ -s "$KEY" ] || die "няма $KEY."
  rm -f "$KEY.new"
  openssl rand -out "$KEY.new" 64 || die "openssl не създаде ключа."
  chmod 400 "$KEY.new"
  cryptsetup luksAddKey --batch-mode --key-file "$KEY" "$SOURCE" "$KEY.new" || {
    rm -f "$KEY.new"
    die "новият ключ не се добави — старият работи както досега."
  }
  cryptsetup open --test-passphrase --key-file "$KEY.new" "$SOURCE" ||
    die "новият ключ не отваря тома — и двата слота са активни ($KEY и $KEY.new); виж cryptsetup luksDump $SOURCE"
  cryptsetup luksRemoveKey --batch-mode "$SOURCE" "$KEY" ||
    die "старият слот не се махна — и двата ключа отварят тома; ръчно: cryptsetup luksRemoveKey $SOURCE $KEY"
  mv -f "$KEY.new" "$KEY"
  ok "новият ключ е в $KEY; старият вече не отваря тома"
  warn "копирай НОВИЯ ключ извън сървъра сега и унищожи старото копие; стари копия на LUKS заглавката още приемат стария ключ."
}

# По-строгият режим: парола при всеки рестарт; ключовият файл изчезва от сървъра.
cmd_manual_unlock() {
  require_root
  need_conf
  lock
  if [ "$MODE" = manual ]; then
    ok "вече е в ръчен режим"
    return 0
  fi
  [ -t 0 ] || die "иска терминал (новата парола се въвежда два пъти)."
  log "нова парола за тома (дълга фраза; пази я в password manager):"
  cryptsetup luksAddKey --key-file "$KEY" "$SOURCE" || die "паролата не се добави — нищо не е сменено."
  log "проба на паролата:"
  cryptsetup open --test-passphrase "$SOURCE" || die "паролата не отваря тома — ключовият файл остава."
  cryptsetup luksRemoveKey --batch-mode "$SOURCE" "$KEY" || die "слотът на ключовия файл не се махна."
  shred -u "$KEY" 2>/dev/null || rm -f "$KEY"
  conf_set MODE manual
  ok "ръчен режим: след всеки рестарт — sudo chatchat-pgdata open (дотогава базата на ChatChat не тръгва)"
}

cmd_auto_unlock() {
  require_root
  need_conf
  lock
  if [ "$MODE" != manual ]; then
    ok "вече е с ключов файл"
    return 0
  fi
  [ -t 0 ] || die "иска терминал (сегашната парола)."
  rm -f "$KEY.new"
  openssl rand -out "$KEY.new" 64 || die "openssl не създаде ключа."
  chmod 400 "$KEY.new"
  cryptsetup luksAddKey "$SOURCE" "$KEY.new" || {
    rm -f "$KEY.new"
    die "ключът не се добави."
  }
  cryptsetup open --test-passphrase --key-file "$KEY.new" "$SOURCE" || die "новият ключ не отваря тома."
  mv -f "$KEY.new" "$KEY"
  conf_set MODE keyfile
  ok "ключов файл $KEY — отключва се сам при старт"
  warn "паролата остава като резервен слот (махни я с cryptsetup luksRemoveKey $SOURCE); копирай ключа извън сървъра."
}

main() {
  local cmd="${1:-}"
  [ $# -eq 0 ] || shift
  case "$cmd" in
    enable) cmd_enable ;;
    open) cmd_open "$@" ;;
    close) cmd_close "$@" ;;
    status) cmd_status ;;
    rotate-key) cmd_rotate_key ;;
    manual-unlock) cmd_manual_unlock ;;
    auto-unlock) cmd_auto_unlock ;;
    *) die "употреба: pgdata-encrypt.sh (enable | open | close | status | rotate-key | manual-unlock | auto-unlock)" ;;
  esac
}

# Изпълнен — командата; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
