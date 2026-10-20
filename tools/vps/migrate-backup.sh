#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# migrate-backup.sh — пълен шифриран архив на VPS за преместване на нов сървър.
#
# Не предполага какво върви на машината — ОТКРИВА го: наши systemd услуги и
# таймери, Docker контейнери/томове/bind папки, Postgres/MySQL/Redis в контейнер
# или на хоста, SQLite файлове, nginx/Caddy, TLS сертификати, крон, PM2. Така
# хваща и продукти извън монорепото (ERP и др.). Логическите дъмпове на базите
# са основата за възстановяване; суровите файлове са втората линия.
#
# Режими:
#   PLAN=1   само инвентар + размери + какво би спрял FINAL. Нищо не пипа.
#   (нищо)   „горещ“ архив: нищо не се спира; дъмпът е консистентен за всяка база,
#            суровите томове на ЖИВИ бази се пропускат (копие на жива база е боклук).
#   FINAL=1  замразяване за преместването: спира писачите (наши услуги, таймери,
#            крон, контейнери без базите) → дъмпове → спира и базите → архив с
#            всичко. Сървърът ОСТАВА спрян; връщане: restart-<час>.sh до архива.
#
# Употреба (като root, в tmux — голям сървър отнема десетки минути):
#   PLAN=1 bash migrate-backup.sh
#   bash migrate-backup.sh                 # репетиция, без прекъсване
#   FINAL=1 bash migrate-backup.sh         # при преместването, преди DNS
#
# Изход в OUT_DIR (по подразбиране /var/migrate, 700):
#   <хост>-<режим>-<час>.tar.{zst,gz}.gpg   шифриран архив (AES256)
#   <хост>-<режим>-<час>.sha256             контролна сума на шифрирания архив
#   <хост>-<режим>-<час>.inventory.txt      инвентар БЕЗ тайни — за плана на новия сървър
#
# Ключът е PASS_FILE (по подразбиране /root/migrate.pass, 600); създава се, ако
# липсва. Без него архивът не се отваря — пази копие ИЗВЪН сървъра.
#
# Други: EXTRA_PATHS="/mnt/data …" добавя пътища · STOP_EXCLUDE="unit …" пази
# услуга от FINAL · SAVE_IMAGES=1 добавя локално построените Docker образи ·
# VERIFY=0 пропуска пробното отваряне · YES=1 без въпрос във FINAL ·
# FORCE=1 продължава при малко свободно място.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077
cd /

# ╔═ КОНФИГУРАЦИЯ ═══════════════════════════════════════════════════════════════
OUT_DIR="${OUT_DIR:-/var/migrate}"
PASS_FILE="${PASS_FILE:-/root/migrate.pass}"
PLAN="${PLAN:-0}"
FINAL="${FINAL:-0}"
YES="${YES:-0}"
VERIFY="${VERIFY:-1}"
FORCE="${FORCE:-0}"
SAVE_IMAGES="${SAVE_IMAGES:-0}"
# Пътищата, които влизат в архива цели. ROOTS се подменя само за тест.
ROOTS="${ROOTS:-/etc /opt /srv /home /root /var/www /var/backups /var/spool/cron /var/lib/vps-dashboard /var/lib/caddy /var/lib/redis /usr/local}"
EXTRA_PATHS="${EXTRA_PATHS:-}"
STOP_EXCLUDE="${STOP_EXCLUDE:-}"
RELEASES_DIR="${RELEASES_DIR:-/opt/few-few/releases}"
CURRENT_LINK="${CURRENT_LINK:-/opt/few-few/current}"
# Тези не се спират никога: без тях няма вход, мрежа и страница за поддръжка.
ALWAYS_KEEP="ssh.service sshd.service docker.service containerd.service nginx.service caddy.service cron.service fail2ban.service ufw.service"

die(){  printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
ok(){   printf '\033[32m✔ %s\033[0m\n' "$*"; }
inf(){  printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
WARNS=(); FAILS=()
warn(){ printf '\033[33m⚠ %s\033[0m\n' "$*" >&2; WARNS+=("$*"); }
fail(){ printf '\033[31m✘ %s\033[0m\n' "$*" >&2; FAILS+=("$*"); }

case "${1:-}" in -h|--help) sed -n '2,/^# ─\{10,\}$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac

[ "$(id -u)" -eq 0 ] || die "Пусни като root (sudo -i)."
case "$PLAN:$FINAL" in
  0:0) MODE=hot;;
  0:1) MODE=final;;
  1:0|1:1) MODE=plan;;
  *) die "PLAN и FINAL приемат само 0 или 1.";;
esac

case "$OUT_DIR" in /?*) ;; *) die "OUT_DIR трябва да е абсолютен път, различен от /.";; esac
OUT_DIR="${OUT_DIR%/}"
for r in $ROOTS $EXTRA_PATHS; do
  case "$OUT_DIR/" in "${r%/}/"*)
    die "OUT_DIR ($OUT_DIR) е вътре в архивирания $r — архивът би влязъл сам в себе си. Избери друг, напр. /var/migrate.";;
  esac
done

TS="$(date -u +%Y%m%dT%H%M%SZ)"
HOST="$(hostname -s 2>/dev/null || hostname)"
HOST="${HOST//[^A-Za-z0-9._-]/_}"
NAME="$HOST-$MODE-$TS"

if command -v zstd >/dev/null 2>&1; then COMP=(zstd -T0 -3 -q); DECOMP=(zstd -dcq); EXT=tar.zst
elif command -v pigz >/dev/null 2>&1; then COMP=(pigz -6); DECOMP=(pigz -dc); EXT=tar.gz
else COMP=(gzip -6); DECOMP=(gzip -dc); EXT=tar.gz; fi
OUT="$OUT_DIR/$NAME.$EXT.gpg"
command -v tar >/dev/null 2>&1 || die "Липсва tar."
if [ "$MODE" != plan ]; then
  command -v gpg >/dev/null 2>&1 || die "Липсва gpg: apt-get install -y gnupg"
fi

install -d -m 700 "$OUT_DIR"
chmod 700 "$OUT_DIR"
WORK="$OUT_DIR/.work-$TS"
STAGE="$WORK/migrate"
mkdir -p "$STAGE/db" "$STAGE/sqlite" "$STAGE/system" "$STAGE/docker" "$STAGE/secrets"
# Кратък път: сокетът на gpg-agent живее в homedir, а пътят на unix сокет е до 108 знака.
GPG_HOME="$(mktemp -d /tmp/.migrate-gpg.XXXXXX)"
INV="$STAGE/inventory.txt"; : > "$INV"
RESTART="$OUT_DIR/restart-$TS.sh"
STOPPED_ANY=0

cleanup(){
  local rc=$?
  # STAGE държи НЕшифровани дъмпове — трие се при всеки изход, и при провал.
  case "$WORK" in "$OUT_DIR"/.work-*) rm -rf -- "$WORK";; esac
  gpgconf --homedir "$GPG_HOME" --kill gpg-agent >/dev/null 2>&1 || true
  case "$GPG_HOME" in /tmp/.migrate-gpg.*) rm -rf -- "$GPG_HOME";; esac
  rm -f -- "$OUT.part"
  if [ "$rc" -ne 0 ] && [ "$STOPPED_ANY" = 1 ]; then
    printf '\033[31m✘ Прекъснато, а услуги са СПРЕНИ. Връщане: bash %s\033[0m\n' "$RESTART" >&2
  fi
}
trap cleanup EXIT

inv(){  printf '%s\n' "$*" >> "$INV"; }
sect(){ printf '\n== %s ==\n' "$*" >> "$INV"; }
safe(){ printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'; }
kb_h(){ numfmt --to=iec --from-unit=1024 "${1:-0}" 2>/dev/null || printf '%sK' "${1:-0}"; }
under_roots(){ local p=$1 r; for r in $ROOTS $EXTRA_PATHS; do case "$p/" in "${r%/}/"*) return 0;; esac; done; return 1; }
has_root_under(){ local p=${1%/} r; for r in $ROOTS $EXTRA_PATHS; do case "${r%/}/" in "$p"/*) return 0;; esac; done; return 1; }

# ╔═ КЛЮЧ ═══════════════════════════════════════════════════════════════════════
if [ "$MODE" != plan ]; then
  if [ ! -s "$PASS_FILE" ]; then
    install -d -m 700 "$(dirname "$PASS_FILE")"
    head -c 48 /dev/urandom | base64 -w0 > "$PASS_FILE"
    chmod 600 "$PASS_FILE"
    warn "Създаден е нов ключ $PASS_FILE — препиши го в password manager (cat $PASS_FILE). Без него архивът е безполезен."
  fi
  [ "$(wc -c < "$PASS_FILE")" -ge 20 ] || die "$PASS_FILE е твърде къс (под 20 знака)."
  case "$(stat -c %a "$PASS_FILE")" in 600|400) ;; *) chmod 600 "$PASS_FILE"; warn "$PASS_FILE имаше по-широки права — върнати на 600.";; esac
fi

# ╔═ ОТКРИВАНЕ: Docker ══════════════════════════════════════════════════════════
DOCKER=0
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then DOCKER=1
  else
    warn "Docker е инсталиран, но демонът не отговаря — /var/lib/docker/volumes влиза в архива суров."
    ROOTS="$ROOTS /var/lib/docker/volumes"
  fi
fi

# Вид на контейнера: по името на образа ИЛИ по маркерите на официалните образи в
# средата (само имената на променливите, без стойности). Втората проверка хваща
# собствени образи „FROM postgres“, които иначе минават за приложение — тоест
# FINAL би ги спрял ПРЕДИ дъмпа.
db_kind(){
  local c=$1 img base keys
  img="$(docker inspect -f '{{.Config.Image}}' "$c")"
  base="${img##*/}"; base="${base%%[:@]*}"; base="${base,,}"
  keys="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" | cut -d= -f1)"
  if [[ "$base" =~ ^(postgres|postgresql|postgis|timescaledb(-ha)?|pgvector)$ ]] || grep -qx 'PGDATA' <<<"$keys"; then echo pg
  elif [[ "$base" =~ ^(mysql|mariadb|percona-server)$ ]] || grep -qxE 'MARIADB_VERSION|MYSQL_VERSION|MYSQL_MAJOR' <<<"$keys"; then echo my
  elif [[ "$base" =~ ^(redis|redis-stack-server|valkey|keydb)$ ]] || grep -qxE 'REDIS_VERSION|VALKEY_VERSION' <<<"$keys"; then echo redis
  elif [[ "$base" =~ ^(mongo|mongodb-community-server)$ ]] || grep -qx 'MONGO_VERSION' <<<"$keys"; then echo mongo
  else echo app; fi
}

is_running(){ [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" = true ]; }
declare -A CKIND=() CRUN=() LIVE_DB_SRC=() VOL_USERS=()
CONTAINERS=(); BINDS=(); VOLS=(); INC_VOLS=(); SKIP_VOLS=()
if [ "$DOCKER" = 1 ]; then
  while IFS= read -r c; do
    [ -n "$c" ] || continue
    CONTAINERS+=("$c")
    CKIND[$c]="$(db_kind "$c")"
    CRUN[$c]="$(docker inspect -f '{{.State.Running}}' "$c")"
    while IFS='|' read -r mtype mname msrc; do
      [ -n "$mtype" ] || continue
      [ "$mtype" = volume ] && VOL_USERS[$mname]="${VOL_USERS[$mname]:-}$c "
      [ "$mtype" = bind ] && BINDS+=("$msrc")
      if [ "${CKIND[$c]}" != app ] && [ "${CRUN[$c]}" = true ]; then LIVE_DB_SRC[$msrc]=1; fi
    done < <(docker inspect -f '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}{{println}}{{end}}' "$c")
  done < <(docker ps -a --format '{{.Names}}')
  while IFS= read -r v; do
    [ -n "$v" ] || continue
    VOLS+=("$v")
    mp="$(docker volume inspect -f '{{.Mountpoint}}' "$v")"
    # Горещ режим: том на ЖИВА база не се копира сурово — дъмпът е копието.
    # FINAL спира базите преди архива, значи там суровото копие е консистентно.
    if [ "$MODE" != final ] && [ -n "${LIVE_DB_SRC[$mp]:-}" ]; then SKIP_VOLS+=("$v"); else INC_VOLS+=("$mp"); fi
  done < <(docker volume ls -q)
fi

# ╔═ ОТКРИВАНЕ: systemd ═════════════════════════════════════════════════════════
# „Наши“ = unit файлове, сложени в /etc/systemd/system от човек/деплой (пакетите
# стоят в /usr/lib). Симлинкове (маскирани/включени) и snap-ове не се броят.
SELF_UNITS="$(grep -oE '[^/]+\.(service|scope)' /proc/self/cgroup 2>/dev/null | tr '\n' ' ' || true)"
UNITS=(); STOP_SERVICES=(); STOP_TIMERS=(); DOCKER_WRAPPERS=()
for f in /etc/systemd/system/*.service /etc/systemd/system/*.timer; do
  if [ ! -f "$f" ] || [ -L "$f" ]; then continue; fi
  u="${f##*/}"
  case "$u" in snap.*|*@.service|*@.timer) continue;; esac
  UNITS+=("$u")
  systemctl is-active --quiet "$u" 2>/dev/null || continue
  # Обвивка около docker compose: спирането ѝ би пуснало `compose down` и би махнало
  # и базата ПРЕДИ дъмпа. Нейните контейнери се спират поотделно по-долу.
  if systemctl cat "$u" 2>/dev/null | grep -qiE '^[[:space:]]*Exec(Start|Stop)[^=]*=.*(docker|podman)'; then
    DOCKER_WRAPPERS+=("$u"); continue
  fi
  # Скриптът, пуснат от уеб терминала на панела, живее в cgroup-а на панела —
  # спирането му би убило и самия архив по средата.
  case " $ALWAYS_KEEP $SELF_UNITS $STOP_EXCLUDE " in *" $u "*|*" ${u%.*} "*) continue;; esac
  case "$u" in *.timer) STOP_TIMERS+=("$u");; *) STOP_SERVICES+=("$u");; esac
done
HOST_DB_UNITS=()
for u in postgresql.service mysql.service mariadb.service redis-server.service mongod.service; do
  if systemctl is-active --quiet "$u" 2>/dev/null; then HOST_DB_UNITS+=("$u"); fi
done
STOP_APPC=(); STOP_DBC=()
for c in "${CONTAINERS[@]}"; do
  [ "${CRUN[$c]}" = true ] || continue
  if [ "${CKIND[$c]}" = app ]; then STOP_APPC+=("$c"); else STOP_DBC+=("$c"); fi
done

# ╔═ ОТКРИВАНЕ: пътища ══════════════════════════════════════════════════════════
EXCL_ANCH=(root/.cache root/.npm 'root/.pm2/logs' 'home/*/.cache' 'home/*/.npm' 'root/few-few-*' 'root/Few-few*.zip')
EXCL_NAME=(node_modules .next .turbo .pnpm-store)
# Старите releases са само код (идва наново от git); пазим current и последния
# работещ на korpora. Техните .env-ове все пак влизат — виж „secrets“ по-долу.
KEEP_REL=()
rel_of(){ local p; p="$(readlink -f "$1" 2>/dev/null || true)"; case "$p" in "$RELEASES_DIR"/*) p="${p#"$RELEASES_DIR"/}"; printf '%s\n' "${p%%/*}";; esac; }
if [ -e "$CURRENT_LINK" ]; then KEEP_REL+=("$(rel_of "$CURRENT_LINK")"); fi
for lg in /opt/few-few/shared/*/last-good; do
  if [ -f "$lg" ]; then KEEP_REL+=("$(rel_of "$(head -n 1 "$lg")")"); fi
done
OLD_REL=()
if [ -d "$RELEASES_DIR" ]; then
  for d in "$RELEASES_DIR"/*/; do
    [ -d "$d" ] || continue
    b="$(basename "$d")"
    case " ${KEEP_REL[*]} " in *" $b "*) continue;; esac
    OLD_REL+=("${d%/}")
    EXCL_ANCH+=("${RELEASES_DIR#/}/$b")
  done
fi
EXTRA_BINDS=()
for b in "${BINDS[@]}"; do
  case "$b" in /|/proc*|/sys*|/dev*|/run*|/var/run*|/var/lib/docker*|/tmp*) continue;; esac
  [ -e "$b" ] || continue
  if [ "$MODE" != final ] && [ -n "${LIVE_DB_SRC[$b]:-}" ]; then
    under_roots "$b" && EXCL_ANCH+=("${b#/}")
    continue
  fi
  under_roots "$b" && continue
  case " ${EXTRA_BINDS[*]} " in *" $b "*) continue;; esac
  EXTRA_BINDS+=("$b")
done
TAR_PATHS=()
for p in $ROOTS $EXTRA_PATHS "${EXTRA_BINDS[@]}" "${INC_VOLS[@]}"; do
  if [ -e "$p" ]; then TAR_PATHS+=("${p#/}"); fi
done

# ╔═ ИНВЕНТАР (без тайни) ═══════════════════════════════════════════════════════
inf "Инвентар на $HOST…"
inv "# Инвентар на $HOST — режим $MODE — $TS (UTC). Без тайни: само имена, пътища и размери."
sect "Машина"
inv "host: $HOST · fqdn: $(hostname -f 2>/dev/null || echo -)"
inv "os: $(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-?}") · kernel: $(uname -r)"
inv "cpu: $(nproc) · ram: $(free -h | awk '/^Mem:/{print $2}') · swap: $(free -h | awk '/^Swap:/{print $2}')"
ip -br -4 addr show scope global 2>/dev/null | sed 's/^/ipv4: /' >> "$INV" || true
ip -br -6 addr show scope global 2>/dev/null | sed 's/^/ipv6: /' >> "$INV" || true
df -hP -x tmpfs -x devtmpfs -x overlay -x squashfs -x efivarfs 2>/dev/null >> "$INV" || true
while read -r tgt fstype; do
  case "$tgt" in /|/boot|/boot/*) continue;; esac
  under_roots "$tgt" && continue
  has_root_under "$tgt" && continue
  warn "Диск, монтиран на $tgt ($fstype), НЕ е в архива — ако държи данни: EXTRA_PATHS=$tgt"
done < <(findmnt -rn -o TARGET,FSTYPE -t ext4,ext3,xfs,btrfs,zfs 2>/dev/null || true)

sect "Слушащи портове (proto · адрес · процес)"
ss -tulpnH 2>/dev/null | awk '{print $1, $5, $7}' | sort -u >> "$INV" || true

sect "Наши systemd units (unit · active · enabled · User · WorkingDirectory)"
for u in "${UNITS[@]}"; do
  inv "$u · $(systemctl is-active "$u" 2>/dev/null || true) · $(systemctl is-enabled "$u" 2>/dev/null || true) · $(systemctl show -p User --value "$u" 2>/dev/null || true) · $(systemctl show -p WorkingDirectory --value "$u" 2>/dev/null || true)"
done
for u in "${HOST_DB_UNITS[@]}"; do inv "$u · active (база на хоста)"; done
# Всяко pm2 извикване вдига демона, ако не върви — а `pm2 save` върху празен демон
# презаписва записания списък с празен. Затова само при жив демон.
PM2_LIVE=0
if command -v pm2 >/dev/null 2>&1 && pgrep -f 'PM2 v[0-9.]+: God Daemon' >/dev/null 2>&1; then PM2_LIVE=1; fi
if [ "$PM2_LIVE" = 1 ]; then
  sect "PM2 (root)"
  pm2 ls --no-color 2>/dev/null >> "$INV" || true
fi

if [ "$DOCKER" = 1 ]; then
  sect "Docker контейнери (име · образ · състояние · вид · compose проект · папка · портове)"
  for c in "${CONTAINERS[@]}"; do
    inv "$(docker inspect -f '{{.Name}} · {{.Config.Image}} · {{.State.Status}}' "$c" | sed 's#^/##') · ${CKIND[$c]} · $(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}} · {{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$c") · $(docker ps -a --filter "name=^${c}$" --format '{{.Ports}}')"
  done
  sect "Docker томове (име · размер · ползва се от · в архива)"
  for v in "${VOLS[@]}"; do
    mp="$(docker volume inspect -f '{{.Mountpoint}}' "$v")"
    state=да; case " ${SKIP_VOLS[*]} " in *" $v "*) state="не (жива база — дъмпът е копието)";; esac
    inv "$v · $(du -sh "$mp" 2>/dev/null | cut -f1) · ${VOL_USERS[$v]:-нищо} · $state"
  done
  sect "Docker образи, построени локално (без registry digest — билдват се наново)"
  for c in "${CONTAINERS[@]}"; do docker inspect -f '{{.Config.Image}}' "$c"; done | sort -u | while IFS= read -r img; do
    if [ "$(docker image inspect -f '{{len .RepoDigests}}' "$img" 2>/dev/null || echo 0)" = 0 ]; then printf '%s\n' "$img"; fi
  done >> "$INV"
  docker compose ls -a 2>/dev/null >> "$INV" || true
fi

sect "Домейни (nginx server_name · Caddy адреси)"
{ grep -rhoE '^[[:space:]]*server_name[[:space:]]+[^;]+' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null \
    | sed -E 's/^[[:space:]]*server_name[[:space:]]+//' | tr ' ' '\n'
  cat /etc/caddy/Caddyfile /etc/caddy/sites/*.caddy 2>/dev/null | grep -E '^[^#[:space:]({][^{]*\{[[:space:]]*$' | sed -E 's/[[:space:]]*\{[[:space:]]*$//' | tr ', ' '\n\n'
} | grep -vE '^(_|)$' | sort -u >> "$INV" || true

sect "TLS сертификати (Let's Encrypt: име · изтича)"
for d in /etc/letsencrypt/live/*/; do
  [ -f "$d/cert.pem" ] || continue
  inv "$(basename "$d") · $(openssl x509 -in "$d/cert.pem" -noout -enddate 2>/dev/null | cut -d= -f2)"
done

sect "Крон (потребител · брой редове) — съдържанието е в архива"
for f in /var/spool/cron/crontabs/*; do
  if [ -f "$f" ]; then inv "$(basename "$f") · $(grep -cvE '^[[:space:]]*(#|$)' "$f" || true)"; fi
done
ls /etc/cron.d 2>/dev/null | sed 's#^#/etc/cron.d/#' >> "$INV" || true

sect "Версии"
for v in "node -v" "npm -v" "docker --version" "nginx -v" "caddy version" "psql --version" "certbot --version" "python3 --version"; do
  set -- $v
  if command -v "$1" >/dev/null 2>&1; then inv "$v: $($v 2>&1 | head -n 1)"; fi
done

# ╔═ ПЛАН ═══════════════════════════════════════════════════════════════════════
sect "FINAL би спрял (в този ред; връщане с restart-<час>.sh)"
inv "крон: $(systemctl is-active cron 2>/dev/null || true)"
inv "таймери: ${STOP_TIMERS[*]:-—}"
inv "услуги: ${STOP_SERVICES[*]:-—}"
inv "контейнери-приложения: ${STOP_APPC[*]:-—}"
inv "след дъмповете — контейнери-бази: ${STOP_DBC[*]:-—}"
inv "след дъмповете — бази на хоста: ${HOST_DB_UNITS[*]:-—}"
inv "НЕ се пипат: $ALWAYS_KEEP $SELF_UNITS $STOP_EXCLUDE"
inv "docker обвивки (не се спират — контейнерите им се спират поотделно): ${DOCKER_WRAPPERS[*]:-—}"

sect "Архивът (пътища · размер преди компресия)"
EST=0
DU_EXCL=(); for n in "${EXCL_NAME[@]}"; do DU_EXCL+=("--exclude=$n"); done
for p in "${TAR_PATHS[@]}"; do
  s="$(du -sxk "${DU_EXCL[@]}" "/$p" 2>/dev/null | cut -f1 || true)"
  EST=$((EST + ${s:-0}))
  inv "/$p · $(kb_h "${s:-0}")"
done
for p in /opt /srv /home /var/www; do
  if [ -d "$p" ] && under_roots "$p"; then du -sxh "${DU_EXCL[@]}" "$p"/* 2>/dev/null | sed 's/^/  /' >> "$INV" || true; fi
done
inv "пропуснати стари releases: ${#OLD_REL[@]} (кодът идва от git; .env-овете им влизат)"
inv "изключени имена: ${EXCL_NAME[*]}"
FREE="$(df -Pk "$OUT_DIR" | awk 'NR==2{print $4}')"
inv "общо ≈ $(kb_h "$EST") · свободно в $OUT_DIR: $(kb_h "$FREE")"

if [ "$MODE" = plan ]; then
  sect "Предупреждения"; for w in "${WARNS[@]}"; do inv "⚠ $w"; done
  cp "$INV" "$OUT_DIR/$NAME.inventory.txt"
  ok "План: $OUT_DIR/$NAME.inventory.txt (≈ $(kb_h "$EST") данни, свободни $(kb_h "$FREE"))."
  exit 0
fi

if [ "$FREE" -lt "$EST" ] && [ "$FORCE" != 1 ]; then
  die "Свободни $(kb_h "$FREE") в $OUT_DIR при ≈ $(kb_h "$EST") данни преди компресия. Компресията обикновено сваля 30–60 %: FORCE=1 опитва все пак, или OUT_DIR=<друг диск>."
fi

if [ "$PM2_LIVE" = 1 ]; then pm2 save --force >/dev/null 2>&1 || warn "pm2 save не мина"; fi

# ╔═ FINAL: спиране на писачите ═════════════════════════════════════════════════
STOPPED_CRON=0; STOPPED_TIMERS=(); STOPPED_SVCS=(); STOPPED_APPC=(); STOPPED_DBC=(); STOPPED_HOSTDB=()
write_restart(){
  local x
  {
    printf '#!/usr/bin/env bash\n'
    printf '# Връща %s в състоянието отпреди FINAL архива %s (генериран от migrate-backup.sh).\n' "$HOST" "$TS"
    printf 'set -uo pipefail\n'
    for x in "${STOPPED_HOSTDB[@]}"; do printf 'systemctl start %q\n' "$x"; done
    for x in "${STOPPED_DBC[@]}"; do printf 'docker start %q\n' "$x"; done
    for x in "${STOPPED_APPC[@]}"; do printf 'docker start %q\n' "$x"; done
    for x in "${STOPPED_SVCS[@]}"; do printf 'systemctl start %q\n' "$x"; done
    for x in "${STOPPED_TIMERS[@]}"; do printf 'systemctl start %q\n' "$x"; done
    if [ "$STOPPED_CRON" = 1 ]; then printf 'systemctl start cron\n'; fi
    printf 'echo "Върнато. Провери: systemctl --failed; docker ps"\n'
  } > "$RESTART.tmp"
  chmod 700 "$RESTART.tmp"
  mv -f "$RESTART.tmp" "$RESTART"
}

if [ "$MODE" = final ]; then
  printf '\n\033[1mFINAL ще спре на %s:\033[0m\n' "$HOST"
  printf '  крон · таймери: %s\n  услуги: %s\n  контейнери: %s\n  след дъмповете — бази: %s %s\n' \
    "${STOP_TIMERS[*]:-—}" "${STOP_SERVICES[*]:-—}" "${STOP_APPC[*]:-—}" "${STOP_DBC[*]:-—}" "${HOST_DB_UNITS[*]:-}"
  printf '  НЕ пипа: ssh, docker, nginx, caddy — страниците показват 502, докато трае.\n'
  if [ "$YES" != 1 ]; then
    [ -t 0 ] || die "FINAL без терминал иска YES=1."
    printf '\nЗа потвърждение напиши името на сървъра (%s): ' "$HOST"
    read -r ans
    [ "$ans" = "$HOST" ] || die "Отказано — нищо не е спряно."
  fi
  STOPPED_ANY=1
  write_restart
  if systemctl is-active --quiet cron 2>/dev/null; then
    systemctl stop cron && STOPPED_CRON=1
    write_restart
  fi
  for u in "${STOP_TIMERS[@]}" "${STOP_SERVICES[@]}"; do
    if systemctl stop "$u"; then
      case "$u" in *.timer) STOPPED_TIMERS+=("$u");; *) STOPPED_SVCS+=("$u");; esac
    else fail "Не спря: $u"; fi
    write_restart
  done
  for c in "${STOP_APPC[@]}"; do
    if docker stop -t 30 "$c" >/dev/null; then STOPPED_APPC+=("$c"); else fail "Не спря контейнер: $c"; fi
    write_restart
  done
  ok "Писачите са спрени (${#STOPPED_SVCS[@]} услуги, ${#STOPPED_APPC[@]} контейнера). Връщане: bash $RESTART"
fi

# ╔═ ДЪМПОВЕ ════════════════════════════════════════════════════════════════════
DUMPS=()
ERR="$WORK/err"
errline(){ head -c 300 "$ERR" 2>/dev/null | tr '\n' ' '; }
# PGPASSWORD се взима ОТ средата на контейнера, вътре в него — не минава през
# командния ред на хоста (там всеки потребител го вижда в ps).
pg_exec(){ local c=$1; shift; docker exec "$c" sh -c 'PGPASSWORD="${POSTGRES_PASSWORD:-}" exec "$@"' sh "$@"; }

dump_pg_container(){
  local c=$1 u dbs db f n=0
  if ! u="$(docker exec "$c" sh -c 'printf %s "${POSTGRES_USER:-postgres}"' 2>"$ERR")"; then
    fail "Postgres $c: не се чете потребителят — $(errline)"; return 0
  fi
  pg_exec "$c" pg_dumpall -U "$u" --globals-only > "$STAGE/db/pg-$c-globals.sql" 2>"$ERR" \
    || fail "Postgres $c: ролите (pg_dumpall --globals-only) — $(errline)"
  if ! dbs="$(pg_exec "$c" psql -U "$u" -d postgres -Atc 'SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY 1' 2>"$ERR")"; then
    fail "Postgres $c: списъкът с бази — $(errline)"; return 0
  fi
  while IFS= read -r db; do
    [ -n "$db" ] || continue
    f="$STAGE/db/pg-$c-$(safe "$db").dump"
    # Дъмп, който pg_restore не може да прочете, не е дъмп — проверява се веднага.
    if pg_exec "$c" pg_dump -U "$u" -Fc -d "$db" > "$f" 2>"$ERR" && docker exec -i "$c" pg_restore -l < "$f" >/dev/null 2>&1; then
      DUMPS+=("postgres · $c · $db · $(du -h "$f" | cut -f1) · ok"); n=$((n + 1))
    else
      fail "Postgres $c/$db: дъмпът не мина — $(errline)"
      DUMPS+=("postgres · $c · $db · — · ПРОВАЛ")
    fi
  done <<< "$dbs"
  ok "Postgres $c: $n бази"
}

dump_my_container(){
  local c=$1 f="$STAGE/db/mysql-$1-all.sql"
  if docker exec "$c" sh -c 'p="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"; d="$(command -v mariadb-dump || command -v mysqldump)" || exit 3; MYSQL_PWD="$p" exec "$d" -uroot --all-databases --single-transaction --routines --events --triggers' > "$f" 2>"$ERR" \
     && tail -c 200 "$f" | grep -q 'Dump completed'; then
    DUMPS+=("mysql · $c · всички · $(du -h "$f" | cut -f1) · ok"); ok "MySQL/MariaDB $c"
  else
    fail "MySQL/MariaDB $c: дъмпът не мина — $(errline)"; DUMPS+=("mysql · $c · всички · — · ПРОВАЛ")
  fi
}

save_redis_container(){
  local c=$1 out
  out="$(docker exec "$c" sh -c 'cli="$(command -v redis-cli || command -v valkey-cli || command -v keydb-cli)" || exit 3; if [ -n "${REDIS_PASSWORD:-}" ]; then REDISCLI_AUTH="$REDIS_PASSWORD" exec "$cli" SAVE; else exec "$cli" SAVE; fi' 2>&1 | head -c 200)" || true
  if [ "$out" = OK ]; then DUMPS+=("redis · $c · SAVE · ok"); ok "Redis $c: SAVE"
  else warn "Redis $c: SAVE не мина (${out:-без отговор}) — суровият том има последния автоматичен запис; FINAL записва и при спирането."; fi
}

dump_pg_host(){
  local ver name port status rest dbs db f tag
  command -v pg_lsclusters >/dev/null 2>&1 || return 0
  while read -r ver name port status rest; do
    case "$status" in online*) ;; *) continue;; esac
    tag="host-$ver-$name"
    runuser -u postgres -- pg_dumpall -p "$port" --globals-only > "$STAGE/db/pg-$tag-globals.sql" 2>"$ERR" \
      || fail "Postgres $tag: ролите — $(errline)"
    if ! dbs="$(runuser -u postgres -- psql -p "$port" -d postgres -Atc 'SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY 1' 2>"$ERR")"; then
      fail "Postgres $tag: списъкът с бази — $(errline)"; continue
    fi
    while IFS= read -r db; do
      [ -n "$db" ] || continue
      f="$STAGE/db/pg-$tag-$(safe "$db").dump"
      if runuser -u postgres -- pg_dump -p "$port" -Fc -d "$db" > "$f" 2>"$ERR" && runuser -u postgres -- pg_restore -l < "$f" >/dev/null 2>&1; then
        DUMPS+=("postgres · $tag · $db · $(du -h "$f" | cut -f1) · ok")
      else
        fail "Postgres $tag/$db: дъмпът не мина — $(errline)"; DUMPS+=("postgres · $tag · $db · — · ПРОВАЛ")
      fi
    done <<< "$dbs"
    ok "Postgres на хоста $tag"
  done < <(pg_lsclusters -h 2>/dev/null)
}

dump_my_host(){
  local d f="$STAGE/db/mysql-host-all.sql"
  d="$(command -v mariadb-dump || command -v mysqldump || true)"
  [ -n "$d" ] || { fail "MySQL на хоста: няма mysqldump"; return 0; }
  if "$d" --all-databases --single-transaction --routines --events --triggers > "$f" 2>"$ERR" && tail -c 200 "$f" | grep -q 'Dump completed'; then
    DUMPS+=("mysql · хост · всички · $(du -h "$f" | cut -f1) · ok"); ok "MySQL на хоста"
  else fail "MySQL на хоста: дъмпът не мина — $(errline)"; fi
}

inf "Дъмпове на базите…"
for c in "${CONTAINERS[@]}"; do
  [ "${CKIND[$c]}" != app ] || continue
  if ! is_running "$c"; then
    warn "${CKIND[$c]} $c е спрян — без дъмп; суровият му том влиза в архива (спрян = консистентен)."
    continue
  fi
  case "${CKIND[$c]}" in
    pg) dump_pg_container "$c";;
    my) dump_my_container "$c";;
    redis) save_redis_container "$c";;
    mongo) warn "MongoDB $c: без логически дъмп — разчита се на суровия том (консистентен само във FINAL).";;
  esac
done
dump_pg_host
case " ${HOST_DB_UNITS[*]} " in *" mysql.service "*|*" mariadb.service "*) dump_my_host;; esac
case " ${HOST_DB_UNITS[*]} " in *" redis-server.service "*)
  if [ "$(redis-cli SAVE 2>&1 | head -c 50)" = OK ]; then ok "Redis на хоста: SAVE"; else warn "Redis на хоста: SAVE не мина — /var/lib/redis влиза суров."; fi;;
esac

# ╔═ SQLite ═════════════════════════════════════════════════════════════════════
# Копие през backup API = консистентно и при жива база (суровият файл + -wal
# по време на запис не е). Root-ски -wal/-shm, създадени от отварянето, се връщат
# на собственика — иначе услугата след връщане пада с „readonly database“.
SQLITE_PY='import sqlite3, sys, urllib.parse
src = sqlite3.connect("file:" + urllib.parse.quote(sys.argv[1]) + "?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
src.close()
r = dst.execute("PRAGMA quick_check").fetchone()[0]
dst.close()
sys.exit(0 if r == "ok" else 4)'
SQLITES=()
backup_sqlite(){
  local f=$1 dst="$STAGE/sqlite$1" own had_wal=0 had_shm=0 st=0
  if [ -e "$f-wal" ]; then had_wal=1; fi
  if [ -e "$f-shm" ]; then had_shm=1; fi
  mkdir -p "$(dirname "$dst")"
  if command -v python3 >/dev/null 2>&1; then
    python3 -I -c "$SQLITE_PY" "$f" "$dst" 2>"$ERR" || st=$?
  elif command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 -readonly "$f" ".backup '$dst'" 2>"$ERR" || st=$?
  else
    st=127; printf 'няма python3 и sqlite3' > "$ERR"
  fi
  own="$(stat -c %u:%g "$f")"
  if [ "$had_wal" = 0 ] && [ -e "$f-wal" ]; then chown "$own" "$f-wal"; fi
  if [ "$had_shm" = 0 ] && [ -e "$f-shm" ]; then chown "$own" "$f-shm"; fi
  if [ "$st" = 0 ]; then SQLITES+=("$f · $(du -h "$dst" | cut -f1) · $(stat -c %U "$f") · ok")
  else fail "SQLite $f: копието не мина (код $st) — $(errline); суровият файл е в архива"; SQLITES+=("$f · — · ПРОВАЛ"); fi
}
inf "SQLite бази…"
SQL_DIRS=()
for r in $ROOTS $EXTRA_PATHS /var/lib; do if [ -d "$r" ]; then SQL_DIRS+=("$r"); fi; done
while IFS= read -r -d '' f; do
  [ "$(head -c 15 "$f" 2>/dev/null)" = "SQLite format 3" ] || continue
  backup_sqlite "$f"
done < <(find "${SQL_DIRS[@]}" -xdev \( -path /var/lib/docker -o -path /var/lib/containerd -o -path /var/lib/postgresql \
           -o -path /var/lib/mysql -o -path /var/lib/snapd -o -path /var/lib/apt -o -path /var/lib/dpkg \
           -o -path "$RELEASES_DIR" -o -path "$OUT_DIR" -o -name node_modules -o -name .cache -o -name .npm \) -prune \
           -o -type f \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' -o -name '*.db3' \) -size +0 -print0 2>/dev/null \
         | sort -zu)
ok "SQLite: ${#SQLITES[@]} бази"

# ╔═ Тайни от старите releases и системни снимки ════════════════════════════════
n=0
for d in "${OLD_REL[@]}"; do
  while IFS= read -r -d '' f; do
    cp -a --parents "$f" "$STAGE/secrets/"; n=$((n + 1))
  done < <(find "$d" -maxdepth 4 -name node_modules -prune -o -type f \( -name '.env' -o -name '.env.*' -o -name '*.env' \) \
             ! -name '*.example' ! -name '*.sample' -print0 2>/dev/null)
done
[ "$n" = 0 ] || ok "$n .env файла от стари releases"

dpkg --get-selections > "$STAGE/system/dpkg-selections.txt" 2>/dev/null || true
apt-mark showmanual > "$STAGE/system/apt-manual.txt" 2>/dev/null || true
systemctl list-units --type=service --state=running --no-legend --plain > "$STAGE/system/running-services.txt" 2>/dev/null || true
systemctl list-timers --all --no-legend > "$STAGE/system/timers.txt" 2>/dev/null || true
ss -tulpnH > "$STAGE/system/ports.txt" 2>/dev/null || true
ufw status verbose > "$STAGE/system/ufw.txt" 2>/dev/null || true
ip addr > "$STAGE/system/ip-addr.txt" 2>/dev/null || true
ip route > "$STAGE/system/ip-route.txt" 2>/dev/null || true
if [ "$DOCKER" = 1 ]; then
  docker ps -a --no-trunc > "$STAGE/docker/ps.txt"
  docker volume ls > "$STAGE/docker/volumes.txt"
  docker network ls > "$STAGE/docker/networks.txt"
  docker images --digests > "$STAGE/docker/images.txt"
  # inspect носи средата на контейнерите (тайни) — затова е САМО вътре в шифрования архив.
  if [ "${#CONTAINERS[@]}" -gt 0 ]; then docker inspect "${CONTAINERS[@]}" > "$STAGE/docker/inspect.json"; fi
  if [ "$SAVE_IMAGES" = 1 ]; then
    mapfile -t LOCAL_IMGS < <(for c in "${CONTAINERS[@]}"; do docker inspect -f '{{.Config.Image}}' "$c"; done | sort -u \
      | while IFS= read -r img; do if [ "$(docker image inspect -f '{{len .RepoDigests}}' "$img" 2>/dev/null || echo 1)" = 0 ]; then printf '%s\n' "$img"; fi; done)
    if [ "${#LOCAL_IMGS[@]}" -gt 0 ]; then
      inf "docker save на ${#LOCAL_IMGS[@]} локални образа…"
      docker save "${LOCAL_IMGS[@]}" -o "$STAGE/docker/local-images.tar" || fail "docker save не мина"
    fi
  fi
fi

# ╔═ FINAL: спиране на базите — суровите томове стават консистентни ═════════════
if [ "$MODE" = final ]; then
  for c in "${STOP_DBC[@]}"; do
    is_running "$c" || continue
    if docker stop -t 60 "$c" >/dev/null; then STOPPED_DBC+=("$c"); else fail "Не спря база: $c"; fi
    write_restart
  done
  for u in "${HOST_DB_UNITS[@]}"; do
    if systemctl stop "$u"; then STOPPED_HOSTDB+=("$u"); else fail "Не спря: $u"; fi
    write_restart
  done
  sect "След спирането още слушат"
  ss -tlpnH 2>/dev/null | awk '{print $4, $6}' | sort -u >> "$INV" || true
fi

sect "Дъмпове (вид · източник · база · размер · статус)"
for x in "${DUMPS[@]}"; do inv "$x"; done
sect "SQLite (път · размер · собственик · статус)"
for x in "${SQLITES[@]}"; do inv "$x"; done
sect "Предупреждения и провали"
for w in "${WARNS[@]}"; do inv "⚠ $w"; done
for x in "${FAILS[@]}"; do inv "✘ $x"; done

# ╔═ АРХИВ ══════════════════════════════════════════════════════════════════════
STAGE_KB="$(du -sk "$WORK" | cut -f1)"
FREE="$(df -Pk "$OUT_DIR" | awk 'NR==2{print $4}')"
inf "Архивиране (≈ $(kb_h "$((EST + STAGE_KB))") преди компресия) → $OUT"
TAR_OPTS=(--create --file=- --sparse --acls --xattrs --ignore-failed-read --warning=no-file-changed --warning=no-file-removed --warning=no-file-ignored --anchored)
for x in "${EXCL_ANCH[@]}"; do TAR_OPTS+=("--exclude=$x"); done
TAR_OPTS+=(--no-anchored)
for x in "${EXCL_NAME[@]}"; do TAR_OPTS+=("--exclude=$x"); done
set +e
tar "${TAR_OPTS[@]}" -C / "${TAR_PATHS[@]}" -C "$WORK" migrate \
  | "${COMP[@]}" \
  | gpg --homedir "$GPG_HOME" --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$PASS_FILE" \
        --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --compress-algo none --output "$OUT.part"
PS=("${PIPESTATUS[@]}")
set -e
# tar 1 = „файлът се промени, докато се четеше“ — нормално в горещ режим за логове.
if [ "${PS[0]}" -gt 1 ] || [ "${PS[1]}" != 0 ] || [ "${PS[2]}" != 0 ]; then
  die "Архивът НЕ е създаден (tar=${PS[0]} компресия=${PS[1]} gpg=${PS[2]}). Свободно място? df -h $OUT_DIR"
fi
if [ "${PS[0]}" = 1 ]; then warn "tar: някои файлове се промениха по време на четене (нормално за логове в горещ режим)."; fi
mv -f "$OUT.part" "$OUT"
( cd "$OUT_DIR" && sha256sum "$(basename "$OUT")" > "$NAME.sha256" )
ok "Архив: $OUT ($(du -h "$OUT" | cut -f1))"

if [ "$VERIFY" = 1 ]; then
  inf "Проба: дешифриране и пълен прочит на архива…"
  LIST="$WORK/list.txt"
  set +e
  gpg --homedir "$GPG_HOME" --batch --quiet --pinentry-mode loopback --passphrase-file "$PASS_FILE" --decrypt "$OUT" \
    | "${DECOMP[@]}" | tar -tf - > "$LIST"
  PS=("${PIPESTATUS[@]}")
  set -e
  if [ "${PS[0]}" != 0 ] || [ "${PS[1]}" != 0 ] || [ "${PS[2]}" != 0 ]; then
    fail "Пробното отваряне НЕ мина (gpg=${PS[0]} компресия=${PS[1]} tar=${PS[2]}) — архивът е ПОД ВЪПРОС."
  elif ! grep -qx 'migrate/inventory.txt' "$LIST"; then
    fail "В архива липсва migrate/inventory.txt — архивът е ПОД ВЪПРОС."
  else
    ok "Архивът се отваря: $(wc -l < "$LIST") записа, $(grep -c '^migrate/db/' "$LIST" || true) файла с дъмпове."
  fi
fi

cp "$INV" "$OUT_DIR/$NAME.inventory.txt"
{
  printf '\n== Архив ==\n'
  printf '%s · %s\n' "$(basename "$OUT")" "$(du -h "$OUT" | cut -f1)"
  cat "$OUT_DIR/$NAME.sha256"
  for x in "${FAILS[@]}"; do printf '✘ %s\n' "$x"; done
} >> "$OUT_DIR/$NAME.inventory.txt"

printf '\n\033[1mГотово: %s\033[0m\n' "$HOST"
printf '  архив:     %s\n  sha256:    %s\n  инвентар:  %s\n  ключ:      %s (пази копие извън сървъра)\n' \
  "$OUT" "$OUT_DIR/$NAME.sha256" "$OUT_DIR/$NAME.inventory.txt" "$PASS_FILE"
if [ "$MODE" = final ]; then
  printf '  \033[33mСървърът остава СПРЯН. Връщане: bash %s\033[0m\n' "$RESTART"
fi
if [ "${#WARNS[@]}" -gt 0 ]; then printf '  предупреждения: %s (виж инвентара)\n' "${#WARNS[@]}"; fi
if [ "${#FAILS[@]}" -gt 0 ]; then
  printf '\033[31m  ПРОВАЛИ: %s — архивът е създаден, но НЕ е пълен:\033[0m\n' "${#FAILS[@]}"
  for x in "${FAILS[@]}"; do printf '   ✘ %s\n' "$x"; done
  exit 2
fi
