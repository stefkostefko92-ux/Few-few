#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# minecraft/deploy/install.sh — Minecraft сървър с Pelican Panel на VPS-а. Идемпотентен.
#
#   sudo bash minecraft/deploy/install.sh
#
# Пуска се ДВА пъти (виж README.md):
#   1. Първи пробег: тайни → панел (Docker) → nginx + TLS за панела и нода → Wings бинарка + unit.
#      Накрая казва да минеш уеб инсталатора на панела (админ акаунт) — единствената ръчна стъпка.
#   2. След инсталатора: нод + алокация 25565 + egg (bootstrap.php) → конфиг на Wings от панела,
#      втвърден → Wings → сървърът Minecraft (създаден, не пуснат — EULA на Mojang е от човек).
# Всеки следващ пробег = ъпдейт до закачените версии + проверка на здравето.
#
# Тайни не се печатат и не влизат в репото: /opt/pelican/.env (600) се генерира веднъж.
# Изход: 0 — здраво; 1 — спрян (нищо работещо не е пипано, освен ако не е казано изрично).
# ─────────────────────────────────────────────────────────────────────────────
# shellcheck disable=SC1111 # „…“ са български кавички в текста, не синтаксис.
set -euo pipefail
umask 077

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PANEL_FQDN="${PANEL_FQDN:-mc.carbonstealth.eu}"
NODE_FQDN="${NODE_FQDN:-node-mc.carbonstealth.eu}"
LE_EMAIL="${LE_EMAIL:-admin@carbonstealth.eu}"
PANEL_PORT="${PANEL_PORT:-4330}"
WINGS_PORT="${WINGS_PORT:-4331}"
SFTP_PORT="${SFTP_PORT:-2022}"
GAME_PORT="${GAME_PORT:-25565}"
PELICAN_DIR="${PELICAN_DIR:-/opt/pelican}"
PELICAN_SUBNET="${PELICAN_SUBNET:-10.240.30.0/24}"
PELICAN_GATEWAY="${PELICAN_GATEWAY:-10.240.30.1}"
# Мрежата на игровите контейнери (Wings). Подразбирането на Wings е 172.18.0.0/16 — там Docker
# вече е сложил някой от другите compose стекове, затова е изместена.
WINGS_SUBNET="${WINGS_SUBNET:-10.240.31.0/24}"
WINGS_GATEWAY="${WINGS_GATEWAY:-10.240.31.1}"
WINGS_VERSION="${WINGS_VERSION:-v1.0.0-rc.1}"
# sha256 от checksums.txt на релийза (github.com/pelican/wings/releases/tag/v1.0.0-rc.1).
WINGS_SHA256_amd64="19dda386e02041da1f1fbcc73f34e4bb01c1fbc2d499aac79a6be3a51ba7f0e8"
WINGS_SHA256_arm64="ed7deafe0aef2acd3adae73103d2a01b57e8a7eaa56950194bdff11f87f37ff3"
YQ_IMAGE="${YQ_IMAGE:-mikefarah/yq:4.44.3}"
WINGS_CONFIG=/etc/pelican/config.yml
HEALTH_WAIT="${HEALTH_WAIT:-240}"

# Сървърът. Паметта е лимитът на контейнера; JVM взима 95 % от нея (startup на egg-а).
MC_VERSION="${MC_VERSION:-26.3}"
MC_NAME="${MC_NAME:-Minecraft}"
MC_IMAGE="${MC_IMAGE:-ghcr.io/pelican-eggs/yolks:java_25}"
MC_MEMORY="${MC_MEMORY:-4096}"
MC_DISK="${MC_DISK:-16384}"
MC_CPU="${MC_CPU:-0}"
MC_BACKUPS="${MC_BACKUPS:-5}"
NODE_NAME="${NODE_NAME:-carbonstealth-vps}"
NODE_MEMORY="${NODE_MEMORY:-$((MC_MEMORY + 512))}"
NODE_DISK="${NODE_DISK:-$((MC_DISK + 4096))}"
GAME_IP="${GAME_IP:-0.0.0.0}"
EGG_URL="${EGG_URL:-https://raw.githubusercontent.com/pelican-eggs/minecraft/refs/heads/main/java/vanilla/egg-vanilla-minecraft.yaml}"

COMPOSE=(docker compose --project-name pelican --env-file "$PELICAN_DIR/.env" -f "$PELICAN_DIR/compose.yml")

log()  { printf '\033[1;36m▸ minecraft: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ minecraft: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ minecraft: %s\033[0m\n' "$*" >&2; }
fail() { printf '\033[31m✘ minecraft: %s\033[0m\n' "$*" >&2; exit 1; }

# ── 0. Предпоставки ──────────────────────────────────────────────────────────
preflight() {
  [ "$(id -u)" -eq 0 ] || fail "пусни като root (sudo)"
  for bin in docker nginx curl ss sha256sum systemctl; do
    command -v "$bin" >/dev/null || fail "липсва '$bin'"
  done
  docker compose version >/dev/null 2>&1 || fail "липсва 'docker compose' (plugin v2)"
  if ! command -v certbot >/dev/null; then
    log "инсталирам certbot"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  fi

  local virt
  virt="$(systemd-detect-virt 2>/dev/null || true)"
  case "$virt" in
    openvz|lxc|lxc-libvirt) fail "виртуализация '$virt' — Wings иска KVM или хардуер" ;;
  esac

  local total_kb avail_kb
  total_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  avail_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  log "RAM: общо $((total_kb / 1024)) MB, свободна $((avail_kb / 1024)) MB"
  # MC_MEMORY за Minecraft + ~1 GB панел/база/Redis/Wings.
  local need_mb=$((MC_MEMORY + 1024))
  if [ "$avail_kb" -lt $((need_mb * 1024)) ]; then
    warn "свободни са под $need_mb MB — сървър с $MC_MEMORY MB RAM + панелът може да изместят другите продукти (MC_MEMORY=…)"
  fi
}

# ── 1. Портове: свободни или вече наши ───────────────────────────────────────
port_owner() { ss -Htlnp "sport = :$1" 2>/dev/null | head -n 1; }

check_ports() {
  local line
  line="$(port_owner "$PANEL_PORT")"
  if [ -n "$line" ] && ! "${COMPOSE[@]}" ps --status running panel 2>/dev/null | grep -q panel; then
    fail "порт $PANEL_PORT е зает от друг процес: $line"
  fi
  for p in "$WINGS_PORT" "$SFTP_PORT"; do
    line="$(port_owner "$p")"
    if [ -n "$line" ] && ! grep -q '"wings"' <<<"$line"; then
      fail "порт $p е зает от друг процес: $line"
    fi
  done
  line="$(port_owner "$GAME_PORT")"
  if [ -n "$line" ] && ! grep -q 'docker-proxy' <<<"$line"; then
    fail "порт $GAME_PORT е зает от друг процес: $line"
  fi
  ok "портове $PANEL_PORT (панел), $WINGS_PORT (Wings), $SFTP_PORT (SFTP), $GAME_PORT (игра) — свободни или наши"
}

# ── 2. Тайни ─────────────────────────────────────────────────────────────────
# Без `| head` накрая: при pipefail SIGPIPE на tr би бил грешка.
rand() {
  local s
  s="$(head -c 96 /dev/urandom | base64 -w0 | tr -dc 'A-Za-z0-9')"
  printf '%s' "${s:0:$1}"
}

ensure_env() {
  install -d -m 700 "$PELICAN_DIR"
  if [ -f "$PELICAN_DIR/.env" ]; then
    chmod 600 "$PELICAN_DIR/.env"
    ok "тайните са на място ($PELICAN_DIR/.env)"
    return
  fi
  if docker volume inspect pelican_pelican-db >/dev/null 2>&1; then
    fail "има volume pelican_pelican-db, но няма $PELICAN_DIR/.env — нова парола не отваря стара база. Върни .env от /var/backups/pelican/*/stack.env"
  fi
  log "генерирам тайните (веднъж)"
  {
    printf 'PANEL_FQDN=%s\n' "$PANEL_FQDN"
    printf 'PANEL_PORT=%s\n' "$PANEL_PORT"
    printf 'PELICAN_SUBNET=%s\n' "$PELICAN_SUBNET"
    printf 'PELICAN_GATEWAY=%s\n' "$PELICAN_GATEWAY"
    printf 'APP_KEY=base64:%s\n' "$(head -c 32 /dev/urandom | base64)"
    printf 'DB_PASSWORD=%s\n' "$(rand 40)"
    printf 'DB_ROOT_PASSWORD=%s\n' "$(rand 40)"
    printf 'REDIS_PASSWORD=%s\n' "$(rand 40)"
  } > "$PELICAN_DIR/.env"
  chmod 600 "$PELICAN_DIR/.env"
  ok "тайните са записани в $PELICAN_DIR/.env (600)"
}

# ── 3. Панелът ───────────────────────────────────────────────────────────────
deploy_panel() {
  install -m 644 "$SRC_DIR/compose.yml" "$PELICAN_DIR/compose.yml"
  install -m 700 "$SRC_DIR/backup.sh" "$PELICAN_DIR/backup.sh"

  # Преди ъпдейт на работещ панел — бекъп (миграциите тичат от entrypoint-а на новия образ).
  if "${COMPOSE[@]}" ps --status running database 2>/dev/null | grep -q database; then
    log "бекъп преди ъпдейта"
    bash "$PELICAN_DIR/backup.sh" || fail "бекъпът се провали — ъпдейтът спира, работещият панел не е пипан"
  fi

  log "панел: pull + up"
  "${COMPOSE[@]}" pull --quiet
  # Монтажът с subpath: plugins иска папката да съществува, иначе контейнерът не стартира
  # („lstat …/_data/plugins: no such file“) — при чиста инсталация volume-ът е празен. Създава се
  # с потребителя на образа (www-data), за да остане собствеността на volume-а негова.
  "${COMPOSE[@]}" create --quiet-pull >/dev/null
  docker run --rm -v pelican_pelican-data:/pelican-data --entrypoint mkdir \
    "$(sed -n 's/^ *image: *\(ghcr\.io\/pelican\/panel:.*\)$/\1/p' "$PELICAN_DIR/compose.yml")" -p /pelican-data/plugins
  "${COMPOSE[@]}" up -d --remove-orphans

  log "чакам панела (до ${HEALTH_WAIT}s — първият старт е бавен)"
  local i code=000
  for ((i = 0; i < HEALTH_WAIT; i += 5)); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PANEL_PORT/up" || true)"
    [ "$code" = "200" ] && break
    sleep 5
  done
  [ "$code" = "200" ] || fail "панелът не отговаря на 127.0.0.1:$PANEL_PORT/up (последно: $code). Логове: ${COMPOSE[*]} logs panel"
  ok "панелът е жив на 127.0.0.1:$PANEL_PORT"
}

# ── 4. nginx + TLS ───────────────────────────────────────────────────────────
public_ips() { hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$'; }

ensure_cert() {
  local fqdn="$1" resolved
  if [ -f "/etc/letsencrypt/live/$fqdn/fullchain.pem" ]; then
    return 0
  fi
  resolved="$(getent ahostsv4 "$fqdn" | awk '{print $1; exit}')"
  # Нов запис: upstream resolver-ът на VPS-а може да държи стар NXDOMAIN (кеш до SOA минимума), а
  # Let's Encrypt пита свои resolver-и — затова при празен локален отговор питаме публичен.
  if [ -z "$resolved" ] && command -v dig >/dev/null; then
    resolved="$(dig +short A "$fqdn" @1.1.1.1 | grep -E '^[0-9.]+$' | head -n 1)"
  fi
  if [ -z "$resolved" ] || ! public_ips | grep -qx "$resolved"; then
    warn "DNS: $fqdn сочи '${resolved:-нищо}', а не този сървър ($(public_ips | head -n 1)). Добави A запис и пусни отново."
    return 1
  fi
  log "TLS сертификат за $fqdn"
  certbot certonly --nginx -d "$fqdn" --non-interactive --agree-tos -m "$LE_EMAIL" --keep-until-expiring -q
}

install_site() {
  local name="$1" src="$2" port_from="$3" port_to="$4"
  local dst="/etc/nginx/sites-available/$name" link="/etc/nginx/sites-enabled/$name" prev=""
  if [ -f "$dst" ]; then
    prev="$(mktemp)"
    cp "$dst" "$prev"
  fi
  sed "s/127\.0\.0\.1:$port_from/127.0.0.1:$port_to/g" "$src" > "$dst"
  chmod 644 "$dst"
  ln -sf "$dst" "$link"
  if ! nginx -t -q 2>/dev/null; then
    if [ -n "$prev" ]; then cp "$prev" "$dst"; else rm -f "$dst" "$link"; fi
    nginx -t || true
    fail "nginx -t се провали с $name — върнах предишния конфиг"
  fi
  if [ -n "$prev" ]; then rm -f "$prev"; fi
}

setup_nginx() {
  install -d -m 755 /etc/nginx/snippets
  install -m 644 "$SRC_DIR/nginx/pelican-proxy.conf" /etc/nginx/snippets/pelican-proxy.conf
  local have_panel=0 have_node=0
  ensure_cert "$PANEL_FQDN" && have_panel=1
  ensure_cert "$NODE_FQDN" && have_node=1
  if [ "$have_panel" = 1 ]; then install_site pelican-panel "$SRC_DIR/nginx/mc.carbonstealth.eu.conf" 4330 "$PANEL_PORT"; fi
  if [ "$have_node" = 1 ]; then install_site pelican-node "$SRC_DIR/nginx/node-mc.carbonstealth.eu.conf" 4331 "$WINGS_PORT"; fi
  systemctl reload nginx
  [ "$have_panel" = 1 ] && [ "$have_node" = 1 ] || fail "без DNS + сертификати панелът не е достъпен отвън — оправи DNS и пусни отново"
  ok "nginx: https://$PANEL_FQDN и https://$NODE_FQDN"
}

# ── 5. Wings ─────────────────────────────────────────────────────────────────
install_wings() {
  local arch sha marker=/etc/pelican/.wings-version tmp
  case "$(uname -m)" in
    x86_64) arch=amd64; sha="$WINGS_SHA256_amd64" ;;
    aarch64|arm64) arch=arm64; sha="$WINGS_SHA256_arm64" ;;
    *) fail "неподдържана архитектура $(uname -m)" ;;
  esac
  install -d -m 700 /etc/pelican
  install -d -m 755 /var/run/wings /var/lib/pelican /var/log/pelican

  if [ "$(cat "$marker" 2>/dev/null || true)" != "$WINGS_VERSION" ] || [ ! -x /usr/local/bin/wings ]; then
    log "Wings $WINGS_VERSION ($arch)"
    tmp="$(mktemp)"
    curl -fsSL -o "$tmp" "https://github.com/pelican/wings/releases/download/$WINGS_VERSION/wings_linux_$arch"
    echo "$sha  $tmp" | sha256sum -c --quiet - || { rm -f "$tmp"; fail "sha256 на Wings не съвпада — не инсталирам"; }
    install -m 755 "$tmp" /usr/local/bin/wings
    rm -f "$tmp"
    echo "$WINGS_VERSION" > "$marker"
    if systemctl is-active --quiet wings; then systemctl restart wings; fi
  fi
  install -m 644 "$SRC_DIR/systemd/wings.service" /etc/systemd/system/wings.service
  systemctl daemon-reload
  ok "Wings $WINGS_VERSION е инсталиран"
}

yq() { docker run --rm --quiet --user 0:0 -v /etc/pelican:/workdir "$YQ_IMAGE" "$@"; }

# Конфигът идва от панела с api.host 0.0.0.0 и порт по избор. Тук: само localhost (отвън през
# nginx), панелът да не го презаписва, игровата мрежа — извън 172.16/12.
# Задава WINGS_CONFIG_CHANGED=1, ако е пипнал файла. Вика се директно (не в if/&&), за да важи set -e.
WINGS_CONFIG_CHANGED=0
harden_wings_config() {
  local before after port
  before="$(sha256sum "$WINGS_CONFIG" | cut -d' ' -f1)"
  port="$(yq '.api.port' config.yml)"
  [ "$port" = "$WINGS_PORT" ] || warn "api.port в конфига е $port, а nginx сочи $WINGS_PORT — в панела смени Daemon Port на $WINGS_PORT или пусни с WINGS_PORT=$port"
  yq -i "
    .api.host = \"127.0.0.1\" |
    .api.ssl.enabled = false |
    .api.trusted_proxies = [\"127.0.0.1\"] |
    .ignore_panel_config_updates = true |
    .system.sftp.bind_port = $SFTP_PORT |
    .docker.network.interface = \"$WINGS_GATEWAY\" |
    .docker.network.interfaces.v4.subnet = \"$WINGS_SUBNET\" |
    .docker.network.interfaces.v4.gateway = \"$WINGS_GATEWAY\"
  " config.yml
  chmod 600 "$WINGS_CONFIG"
  after="$(sha256sum "$WINGS_CONFIG" | cut -d' ' -f1)"
  if [ "$before" != "$after" ]; then WINGS_CONFIG_CHANGED=1; fi
}

start_wings() {
  harden_wings_config
  systemctl enable --quiet wings
  if systemctl is-active --quiet wings; then
    if [ "$WINGS_CONFIG_CHANGED" = 1 ]; then systemctl restart wings; fi
  else
    systemctl start wings
  fi

  local i code=000
  for ((i = 0; i < 60; i += 3)); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WINGS_PORT/api/system" || true)"
    [ "$code" = "401" ] && break
    sleep 3
  done
  # 401 = жив (API иска токена на панела).
  [ "$code" = "401" ] || fail "Wings не отговаря на 127.0.0.1:$WINGS_PORT (последно: $code). Логове: journalctl -u wings -n 80"
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://$NODE_FQDN/api/system" || true)"
  [ "$code" = "401" ] || fail "Wings не се вижда през https://$NODE_FQDN (код $code) — провери nginx"
  ok "Wings е жив (локално и през https://$NODE_FQDN)"
}

# ── 6. Защитна стена + бекъп таймер ──────────────────────────────────────────
setup_firewall() {
  if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
    ufw allow "$SFTP_PORT/tcp" comment 'Pelican SFTP' >/dev/null
    ufw allow "$GAME_PORT/tcp" comment 'Minecraft' >/dev/null
    ok "ufw: отворени $SFTP_PORT/tcp и $GAME_PORT/tcp"
  else
    warn "ufw не е активен — увери се, че $SFTP_PORT/tcp и $GAME_PORT/tcp са отворени в Hetzner Firewall"
  fi
}

setup_backup_timer() {
  install -m 644 "$SRC_DIR/systemd/pelican-backup.service" /etc/systemd/system/pelican-backup.service
  install -m 644 "$SRC_DIR/systemd/pelican-backup.timer" /etc/systemd/system/pelican-backup.timer
  systemctl daemon-reload
  systemctl enable --now --quiet pelican-backup.timer
  ok "дневен бекъп на панела: pelican-backup.timer (03:40 UTC → /var/backups/pelican)"
}

# ── 7. Настройка в панела (bootstrap.php) ───────────────────────────────────
PANEL_ENV_IN_CONTAINER=/pelican-data/.env
panel_installed() { "${COMPOSE[@]}" exec -T panel grep -q '^APP_INSTALLED=true' "$PANEL_ENV_IN_CONTAINER"; }

bootstrap() {
  local mode="$1"
  "${COMPOSE[@]}" cp "$SRC_DIR/bootstrap.php" panel:/tmp/pelican-bootstrap.php >/dev/null 2>&1
  "${COMPOSE[@]}" exec -T \
    -e BOOTSTRAP_MODE="$mode" -e NODE_NAME="$NODE_NAME" -e NODE_FQDN="$NODE_FQDN" \
    -e NODE_MEMORY="$NODE_MEMORY" -e NODE_DISK="$NODE_DISK" -e WINGS_PORT="$WINGS_PORT" \
    -e SFTP_PORT="$SFTP_PORT" -e GAME_IP="$GAME_IP" -e GAME_PORT="$GAME_PORT" -e GAME_ALIAS="$PANEL_FQDN" \
    -e EGG_URL="$EGG_URL" -e MC_NAME="$MC_NAME" -e MC_VERSION="$MC_VERSION" -e MC_IMAGE="$MC_IMAGE" \
    -e MC_MEMORY="$MC_MEMORY" -e MC_DISK="$MC_DISK" -e MC_CPU="$MC_CPU" -e MC_BACKUPS="$MC_BACKUPS" \
    panel php artisan tinker --execute="require '/tmp/pelican-bootstrap.php';"
}

# Конфигът носи токена на нода: отива направо във файла (600), не се печата.
write_wings_config() {
  local node_id="$1" tmp
  if [ -f "$WINGS_CONFIG" ]; then return 0; fi
  tmp="$(mktemp)"
  "${COMPOSE[@]}" exec -T panel php artisan p:node:configuration "$node_id" --format=yaml > "$tmp"
  grep -q '^token:' "$tmp" || { rm -f "$tmp"; fail "панелът не върна конфиг за нод $node_id"; }
  install -m 600 "$tmp" "$WINGS_CONFIG"
  rm -f "$tmp"
  ok "конфигът на Wings е взет от панела (нод $node_id)"
}

setup_in_panel() {
  local out node_id
  out="$(bootstrap node)" || { printf '%s\n' "$out" >&2; fail "bootstrap (нод/алокация/egg) се провали"; }
  printf '%s\n' "$out" | grep -v '^NODE_ID=' || true
  node_id="$(printf '%s\n' "$out" | sed -n 's/^NODE_ID=\([0-9]\+\)$/\1/p' | tail -n 1)"
  [ -n "$node_id" ] || fail "bootstrap не върна NODE_ID"
  write_wings_config "$node_id"
  start_wings
  bootstrap server || fail "сървърът не беше създаден — виж грешката по-горе (Wings трябва да е достъпен през https://$NODE_FQDN)"
}

installer_step() {
  cat <<EOF

────────────────────────────────────────────────────────────────────
 Остава една ръчна стъпка (подробно в minecraft/README.md):
  1. https://$PANEL_FQDN/installer → админ акаунт (после включи 2FA).
     Базата, кешът и опашката са вече попълнени — само потвърждаваш.
  2. Пусни отново: sudo bash $SRC_DIR/install.sh
     → нод, алокация $GAME_PORT, egg, Wings и сървърът Minecraft $MC_VERSION.
────────────────────────────────────────────────────────────────────
EOF
}

main() {
  preflight
  check_ports
  ensure_env
  deploy_panel
  setup_nginx
  install_wings
  setup_firewall
  setup_backup_timer

  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://$PANEL_FQDN/up" || true)"
  [ "$code" = "200" ] || fail "https://$PANEL_FQDN/up върна $code"
  ok "https://$PANEL_FQDN/up → 200"

  if panel_installed; then
    setup_in_panel
    ok "готово: https://$PANEL_FQDN → сървър „$MC_NAME“ → Start → приеми EULA. Играчите: $PANEL_FQDN"
  else
    installer_step
  fi
}

main "$@"
