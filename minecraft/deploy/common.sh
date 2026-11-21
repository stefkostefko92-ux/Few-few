# shellcheck shell=bash
# ─────────────────────────────────────────────────────────────────────────────
# minecraft/deploy/common.sh — общото на install.sh и switch-flavor.sh: настройки, лог, compose,
# извикването на bootstrap.php. Не се пуска самостоятелно; викащият задава SRC_DIR преди `source`.
# ─────────────────────────────────────────────────────────────────────────────
# shellcheck disable=SC1111 # „…“ са български кавички в текста, не синтаксис.
# shellcheck disable=SC2034 # променливите се ползват от скриптовете, които правят source.

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
WINGS_VOLUMES=/var/lib/pelican/volumes
HEALTH_WAIT="${HEALTH_WAIT:-240}"

# Сървърът. Паметта е лимитът на контейнера; JVM взима 95 % от нея (startup на egg-а).
# MC_FLAVOR: paper (по подразбиране — плъгини, по-бърз) или vanilla (чистият jar на Mojang).
MC_FLAVOR="${MC_FLAVOR:-paper}"
MC_VERSION="${MC_VERSION:-26.3}"
# Paper build — закачен, не `latest`. sha256 е от fill.papermc.io/v3/projects/paper/versions/26.3/builds/207;
# при смяна на MC_VERSION/MC_BUILD се сменя и PAPER_SHA256 (празно = без проверка, с предупреждение).
MC_BUILD="${MC_BUILD:-207}"
PAPER_SHA256="${PAPER_SHA256-2df3b846f70716907d380915cc026667a9cadedf99b1ec680b0c5ff0e6132526}"
# Paper API иска User-Agent с контакт (docs.papermc.io/misc/downloads-service).
PAPER_USER_AGENT="${PAPER_USER_AGENT:-carbonstealth-minecraft/1.0 ($LE_EMAIL)}"
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
EGGS_BASE=https://raw.githubusercontent.com/pelican-eggs/minecraft/refs/heads/main/java
case "$MC_FLAVOR" in
  paper) EGG_URL="${EGG_URL:-$EGGS_BASE/paper/egg-paper.yaml}" ;;
  vanilla) EGG_URL="${EGG_URL:-$EGGS_BASE/vanilla/egg-vanilla-minecraft.yaml}" ;;
  *) printf '✘ minecraft: MC_FLAVOR=%s — позволени са paper и vanilla\n' "$MC_FLAVOR" >&2; exit 1 ;;
esac

COMPOSE=(docker compose --project-name pelican --env-file "$PELICAN_DIR/.env" -f "$PELICAN_DIR/compose.yml")

log()  { printf '\033[1;36m▸ minecraft: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ minecraft: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ minecraft: %s\033[0m\n' "$*" >&2; }
fail() { printf '\033[31m✘ minecraft: %s\033[0m\n' "$*" >&2; exit 1; }

PANEL_ENV_IN_CONTAINER=/pelican-data/.env
panel_installed() { "${COMPOSE[@]}" exec -T panel grep -q '^APP_INSTALLED=true' "$PANEL_ENV_IN_CONTAINER"; }

# bootstrap.php в контейнера на панела (режимите са описани в самия файл).
bootstrap() {
  local mode="$1"
  "${COMPOSE[@]}" cp "$SRC_DIR/bootstrap.php" panel:/tmp/pelican-bootstrap.php >/dev/null 2>&1
  # `compose cp` пази правата на файла; PHP в контейнера не е root и трябва да може да го чете.
  "${COMPOSE[@]}" exec -T -u 0 panel chmod 644 /tmp/pelican-bootstrap.php
  "${COMPOSE[@]}" exec -T \
    -e BOOTSTRAP_MODE="$mode" -e NODE_NAME="$NODE_NAME" -e NODE_FQDN="$NODE_FQDN" \
    -e NODE_MEMORY="$NODE_MEMORY" -e NODE_DISK="$NODE_DISK" -e WINGS_PORT="$WINGS_PORT" \
    -e SFTP_PORT="$SFTP_PORT" -e GAME_IP="$GAME_IP" -e GAME_PORT="$GAME_PORT" -e GAME_ALIAS="$PANEL_FQDN" \
    -e EGG_URL="$EGG_URL" -e MC_FLAVOR="$MC_FLAVOR" -e MC_BUILD="$MC_BUILD" \
    -e PAPER_USER_AGENT="$PAPER_USER_AGENT" -e MC_NAME="$MC_NAME" -e MC_VERSION="$MC_VERSION" \
    -e MC_IMAGE="$MC_IMAGE" -e MC_MEMORY="$MC_MEMORY" -e MC_DISK="$MC_DISK" -e MC_CPU="$MC_CPU" \
    -e MC_BACKUPS="$MC_BACKUPS" -e FORCE_REINSTALL="${FORCE_REINSTALL:-0}" \
    -e POWER_ACTION="${POWER_ACTION:-}" \
    panel php artisan tinker --execute="require '/tmp/pelican-bootstrap.php';"
}

# ── Общо за switch-flavor.sh и auto-update.sh ──────────────────────────────
# Ред „KEY=стойност“ от изхода на `bootstrap info`.
field() { printf '%s\n' "$2" | sed -n "s/^$1=//p" | tail -n 1; }

server_info() {
  local out
  out="$(bootstrap info)" || { printf '%s\n' "$out" >&2; fail "панелът не намери сървър „$MC_NAME“ на нод $NODE_NAME"; }
  printf '%s\n' "$out"
}

# Paper с известен sha256: jar-ът във volume-а е точно този build.
jar_is_target() {
  [ "$MC_FLAVOR" = paper ] && [ -n "$PAPER_SHA256" ] && [ -f "$1/server.jar" ] \
    && [ "$(sha256sum "$1/server.jar" | cut -d' ' -f1)" = "$PAPER_SHA256" ]
}

# Преинсталацията е заявка от контейнера на панела към Wings през https://$NODE_FQDN. Проверява се
# преди бекъпа: 401 от /api/system = Wings е жив и nginx го вижда (API-то иска токена на панела).
panel_reaches_wings() {
  local status
  # shellcheck disable=SC2016 # PHP кодът се изпълнява в контейнера; $argv/$http_response_header са негови.
  status="$("${COMPOSE[@]}" exec -T panel php -r '
    $ctx = stream_context_create(["http" => ["timeout" => 10, "ignore_errors" => true]]);
    $body = @file_get_contents("https://" . $argv[1] . "/api/system", false, $ctx);
    echo $body === false ? "грешка: " . (error_get_last()["message"] ?? "няма връзка") : ($http_response_header[0] ?? "без отговор");
  ' "$NODE_FQDN" 2>&1 | tail -n 1)" || true
  case "$status" in
    *" 401"*) ok "панелът стига до Wings през https://$NODE_FQDN" ;;
    *) fail "панелът не стига до Wings през https://$NODE_FQDN ($status) — нищо не е пипано. Виж README → „Отстраняване на проблеми“ → „панелът не стига до Wings“" ;;
  esac
}

# MC_BUILD=latest →най-новият STABLE build на MC_VERSION и неговият sha256 от Paper API.
# В панела се записва конкретният номер, така че следващ reinstall сваля същия jar.
resolve_latest_build() {
  [ "$MC_FLAVOR" = paper ] && [ "$MC_BUILD" = latest ] || return 0
  command -v python3 >/dev/null || fail "за MC_BUILD=latest трябва python3"
  local json line
  json="$(curl -fsS -m 30 -A "$PAPER_USER_AGENT" "https://fill.papermc.io/v3/projects/paper/versions/$MC_VERSION/builds")" \
    || fail "Paper API не отговори за версия $MC_VERSION"
  line="$(printf '%s' "$json" | python3 -I -c '
import json, sys
builds = [b for b in json.load(sys.stdin) if b.get("channel") == "STABLE"]
if builds:
    b = max(builds, key=lambda b: b["id"])
    print(b["id"], b["downloads"]["server:default"]["checksums"]["sha256"])
')"
  [[ "$line" =~ ^[0-9]+\ [0-9a-f]{64}$ ]] || fail "няма STABLE build на Paper за $MC_VERSION"
  MC_BUILD="${line% *}"
  PAPER_SHA256="${line#* }"
  ok "най-новият STABLE build: Paper $MC_VERSION-$MC_BUILD"
}
