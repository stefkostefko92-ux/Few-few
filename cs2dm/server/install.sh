#!/usr/bin/env bash
# install.sh — фаза 1 на cs2dm: ванилов CS2 Dust2 Deathmatch сървър под systemd.
#
# Идемпотентен: всяко пускане довежда машината до едно и също състояние.
#   sudo bash install.sh --check      само проверки на машината (нищо не променя)
#   sudo bash install.sh              инсталира/обновява; пуска сървъра, ако има GSLT
#   sudo bash install.sh --validate   + пълна проверка на файловете на играта (бавно)
#
# Първото пускане сваля ~60 GB — пускай го в tmux, за да оцелее при прекъснат SSH.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SRC_DIR
# shellcheck source=cs2dm-lib.sh
source "$SRC_DIR/cs2dm-lib.sh"
readonly CS2_USER=cs2
readonly CS2_HOME=/opt/cs2
readonly STEAMCMD_DIR="$CS2_HOME/steamcmd"
readonly SERVER_DIR="$CS2_HOME/server"
readonly STEAM_INF="$SERVER_DIR/game/csgo/steam.inf"
readonly CFG_DIR="$SERVER_DIR/game/csgo/cfg"
readonly LIB_DIR=/usr/local/lib/cs2dm
readonly ENV_DIR=/etc/cs2
readonly ENV_FILE="$ENV_DIR/cs2.env"
readonly LOCK=/run/cs2dm-update.lock
readonly STEAMCMD_URL="https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz"

MODE=install
STEAMCMD_EXTRA=()
for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --validate) STEAMCMD_EXTRA=(validate) ;;
    *) printf 'непознат аргумент: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

WARNINGS=0
BLOCKERS=0
log()  { printf '\n\033[36m[cs2dm]\033[0m %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
info() { printf '  · %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*" >&2; WARNINGS=$((WARNINGS + 1)); }
fail() { printf '  \033[31m✘\033[0m %s\n' "$*" >&2; BLOCKERS=$((BLOCKERS + 1)); }
die()  { printf '\n\033[31m[cs2dm] СТОП:\033[0m %s\n' "$*" >&2; exit 1; }
as_cs2() { runuser -u "$CS2_USER" -- env HOME="$CS2_HOME" "$@"; }
gslt_present() { [[ -f "$ENV_FILE" ]] && grep -Eq '^CS2_GSLT=[A-Za-z0-9]+$' "$ENV_FILE"; }
env_value() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -1 || true; }

[[ $EUID -eq 0 ]] || die "пусни го със sudo"

# Порт: свободен, или вече държан от нашия cs2.
check_port() {
  local proto=$1 port=$2 line
  if [[ "$proto" == udp ]]; then
    line="$(ss -Hulnp "sport = :$port" 2>/dev/null || true)"
  else
    line="$(ss -Htlnp "sport = :$port" 2>/dev/null || true)"
  fi
  if [[ -z "$line" ]]; then
    ok "порт $port/$proto е свободен"
  elif grep -q '"cs2"' <<<"$line"; then
    ok "порт $port/$proto — вече е нашият cs2"
  else
    fail "порт $port/$proto е зает: $line"
  fi
}

preflight() {
  log "Проверки на машината"
  local pretty="непозната" os_id="" os_ver=""
  if [[ -r /etc/os-release ]]; then
    pretty="$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release | tr -d '"')"
    os_id="$(sed -n 's/^ID=//p' /etc/os-release | tr -d '"')"
    os_ver="$(sed -n 's/^VERSION_ID=//p' /etc/os-release | tr -d '"')"
  fi
  # 26.04 (resolute): пакетите по-долу са в main под същите имена (проверено в архива).
  if [[ "$os_id" == ubuntu && ( "$os_ver" == 22.04 || "$os_ver" == 24.04 || "$os_ver" == 26.04 ) ]]; then
    ok "ОС: $pretty"
  else
    warn "ОС: $pretty — скриптът е писан за Ubuntu 22.04/24.04/26.04"
  fi

  if [[ "$(uname -m)" == x86_64 ]]; then ok "архитектура x86_64"; else fail "нужна е x86_64 (сега: $(uname -m))"; fi

  local cores model
  cores="$(nproc)"
  model="$(sed -n 's/^model name[[:space:]]*: //p' /proc/cpuinfo | head -1)"
  info "CPU: $cores ядра · ${model:-?}"
  if grep -qw popcnt /proc/cpuinfo; then ok "CPU поддържа x86-64-v2 (popcnt)"; else fail "CPU без popcnt (x86-64-v2)"; fi
  if (( cores >= 2 )); then ok "≥2 ядра"; else fail "нужни са поне 2 ядра"; fi
  if grep -qw hypervisor /proc/cpuinfo; then
    info "виртуална машина — при shared vCPU (Hetzner CX/CPX) tick-ът скача, когато сайтовете натоварят CPU"
  fi

  local mem_total mem_avail
  mem_total="$(awk '/^MemTotal:/ {printf "%.1f", $2/1048576}' /proc/meminfo)"
  mem_avail="$(awk '/^MemAvailable:/ {printf "%.1f", $2/1048576}' /proc/meminfo)"
  info "RAM: $mem_total GiB общо, $mem_avail GiB свободни"
  if awk '/^MemAvailable:/ {exit !($2 >= 2*1048576)}' /proc/meminfo; then
    ok "≥2 GiB свободна RAM"
  else
    fail "под 2 GiB свободна RAM — CS2 иска поне 2 GiB"
  fi

  local need_gb=70 free_gb
  if [[ -f "$STEAM_INF" ]]; then need_gb=10; fi
  free_gb="$(df -BG --output=avail /opt | tail -1 | tr -dc '0-9')"
  if (( free_gb >= need_gb )); then
    ok "диск: $free_gb GB свободни в /opt (нужни ≥$need_gb)"
  else
    fail "диск: $free_gb GB свободни в /opt, нужни ≥$need_gb GB"
  fi

  check_port udp 27015
  check_port tcp 27015
  check_port udp 27020

  if command -v node >/dev/null 2>&1; then
    local node_major
    node_major="$(node -p 'process.versions.node.split(".")[0]')"
    if (( node_major >= 18 )); then ok "Node $node_major (проверка на здравето)"; else fail "Node $node_major е стар — нужен е ≥18"; fi
  else
    fail "няма Node ≥18 — нужен е за проверката на здравето и за автоматичното връщане към ванилов сървър"
  fi

  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
    ok "ufw е активен"
  else
    warn "ufw не е активен — 27015/udp трябва да се отвори ръчно, 27015/tcp да остане затворен"
  fi
  info "ако има Hetzner Cloud Firewall: разреши входящ UDP 27015 и там"

  if gslt_present; then ok "GSLT е попълнен в $ENV_FILE"; else warn "GSLT липсва в $ENV_FILE — сървърът няма да бъде пуснат"; fi

  printf '\n  Блокери: %s · Предупреждения: %s\n' "$BLOCKERS" "$WARNINGS"
  if (( BLOCKERS > 0 )); then die "има блокери — оправи ги и пусни пак"; fi
}

install_packages() {
  log "Пакети"
  local pkgs=(ca-certificates curl tar lib32gcc-s1 lib32stdc++6) missing=() p
  for p in "${pkgs[@]}"; do
    if ! dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q 'install ok installed'; then missing+=("$p"); fi
  done
  if (( ${#missing[@]} > 0 )); then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "${missing[@]}"
  fi
  ok "${pkgs[*]}"
}

ensure_user() {
  log "Потребител и папки"
  if ! id -u "$CS2_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$CS2_HOME" --create-home --shell /usr/sbin/nologin "$CS2_USER"
  fi
  install -d -o "$CS2_USER" -g "$CS2_USER" -m 0750 "$CS2_HOME" "$STEAMCMD_DIR" "$SERVER_DIR"
  ok "$CS2_USER · $CS2_HOME"
}

ensure_steamcmd() {
  log "SteamCMD"
  if [[ ! -x "$STEAMCMD_DIR/steamcmd.sh" ]]; then
    local tmp
    tmp="$(mktemp -d)"
    curl -fsSL --retry 3 -o "$tmp/steamcmd.tar.gz" "$STEAMCMD_URL"
    tar -xzf "$tmp/steamcmd.tar.gz" -C "$STEAMCMD_DIR"
    rm -f "$tmp/steamcmd.tar.gz"
    rmdir "$tmp"
    chown -R "$CS2_USER:$CS2_USER" "$STEAMCMD_DIR"
  fi
  ok "$STEAMCMD_DIR"
}

install_game() {
  log "CS2 (app 730) — първият път се свалят ~60 GB"
  local attempt
  for attempt in 1 2 3; do
    if as_cs2 "$STEAMCMD_DIR/steamcmd.sh" +force_install_dir "$SERVER_DIR" +login anonymous \
        +app_update 730 "${STEAMCMD_EXTRA[@]}" +quit && [[ -f "$STEAM_INF" ]]; then
      break
    fi
    warn "SteamCMD опит $attempt не завърши"
    sleep 10
  done
  [[ -f "$STEAM_INF" ]] || die "играта не се инсталира — виж изхода на SteamCMD горе"
  ok "CS2 $(sed -n 's/^PatchVersion=//p' "$STEAM_INF" | tr -d '\r')"

  # Известният капан: steamclient.so трябва да е в ~/.steam/sdk64.
  [[ -f "$STEAMCMD_DIR/linux64/steamclient.so" ]] || die "липсва $STEAMCMD_DIR/linux64/steamclient.so"
  as_cs2 mkdir -p "$CS2_HOME/.steam/sdk64"
  as_cs2 ln -sfT "$STEAMCMD_DIR/linux64/steamclient.so" "$CS2_HOME/.steam/sdk64/steamclient.so"
  ok "steamclient.so → ~/.steam/sdk64"
}

install_files() {
  log "Конфигурация и услуги"
  # Скриптовете, които root изпълнява, са извън дома на cs2 — иначе cs2 би могъл да ги подмени.
  install -d -m 0755 "$LIB_DIR" "$LIB_DIR/cfg"
  install -m 0755 "$SRC_DIR/update.sh" "$LIB_DIR/update.sh"
  install -m 0644 "$SRC_DIR/cs2dm-lib.sh" "$LIB_DIR/cs2dm-lib.sh"
  install -m 0644 "$SRC_DIR/a2s.mjs" "$LIB_DIR/a2s.mjs"
  install -m 0755 "$SRC_DIR/health.mjs" "$LIB_DIR/health.mjs"
  install -m 0644 "$SRC_DIR/cfg/gamemode_deathmatch_server.cfg" "$LIB_DIR/cfg/gamemode_deathmatch_server.cfg"
  install -o "$CS2_USER" -g "$CS2_USER" -m 0644 "$SRC_DIR/cfg/gamemode_deathmatch_server.cfg" "$CFG_DIR/gamemode_deathmatch_server.cfg"
  ok "gamemode_deathmatch_server.cfg · $LIB_DIR"

  install -d -m 0700 "$ENV_DIR"
  if [[ ! -f "$ENV_FILE" ]]; then
    install -m 0600 "$SRC_DIR/cs2.env.example" "$ENV_FILE"
    warn "създаден $ENV_FILE — попълни CS2_GSLT"
  fi
  chown root:root "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
  ok "$ENV_FILE (0600)"

  install -m 0644 "$SRC_DIR/systemd/cs2.service" "$SRC_DIR/systemd/cs2-update.service" \
    "$SRC_DIR/systemd/cs2-update.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --quiet --now cs2-update.timer
  ok "cs2.service · cs2-update.timer (на 10 мин)"
}

open_firewall() {
  log "Защитна стена"
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
    ufw allow 27015/udp comment 'cs2dm game' >/dev/null
    ok "ufw: 27015/udp отворен (27015/tcp остава затворен)"
  else
    warn "ufw не е активен — не го пипам; отвори 27015/udp ръчно, 27015/tcp да остане затворен"
  fi
}

start_server() {
  log "Старт"
  if ! gslt_present; then
    warn "CS2_GSLT е празен — сървърът НЕ е пуснат"
    info "попълни го в $ENV_FILE  →  после пусни пак този скрипт"
    return 0
  fi
  systemctl enable --quiet cs2.service
  info "рестарт и чакане на A2S отговор (до 3 минути)…"
  if ! cs2dm_restart_with_mods_or_fallback; then
    if cs2dm_mods_wanted; then warn "модовете не тръгнаха — сървърът върви ванилов (install-mods.sh --status)"; fi
  fi
  local port
  port="$(env_value CS2_PORT)"
  if node "$LIB_DIR/health.mjs" 127.0.0.1 "${port:-27015}" 3000; then
    ok "сървърът отговаря"
    return 0
  fi
  journalctl -u cs2.service -n 60 --no-pager || true
  die "сървърът не отговаря на A2S — логът е горе"
}

preflight
if [[ "$MODE" == check ]]; then
  log "Само проверка — нищо не е променено."
  exit 0
fi

exec 9>"$LOCK"
flock -n 9 || die "друга инсталация/ъпдейт тече — опитай след малко"

install_packages
ensure_user
ensure_steamcmd
install_game
install_files
open_firewall
start_server

log "Готово (предупреждения: $WARNINGS)"
info "логове:       journalctl -u cs2 -f"
info "здраве:       node $LIB_DIR/health.mjs"
info "ъпдейт сега:  sudo systemctl start cs2-update.service"
info "в играта:     connect dm.carbonstealth.eu:27015 (след A запис към IP-то на VPS-а)"
