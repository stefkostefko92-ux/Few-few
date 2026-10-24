#!/usr/bin/env bash
# install-plugins.sh — нашият плъгин CarbonStealth (банове, админ меню, статистики, банери, мост към сайта)
# върху модовете от install-mods.sh.
#
# Идемпотентен. Билдва от изходния код в репото: с локален dotnet (SDK от plugins/global.json) или в
# официалния .NET SDK контейнер, закован по digest. Тайните (база, Redis, ключ на моста) идват от
# /etc/cs2/cs2.env и отиват само в конфига на плъгина (0600, собственик cs2) — никога в репото.
#   sudo bash install-plugins.sh            билд + инсталиране + рестарт
#   sudo bash install-plugins.sh --config   само конфигът (след промяна в cs2.env) + рестарт
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SRC_DIR
# shellcheck source=../cs2dm-lib.sh
source "$SRC_DIR/../cs2dm-lib.sh"

readonly PLUGIN_SRC="$SRC_DIR/../../plugins"
readonly CS2_USER=cs2
readonly CSS_DIR=/opt/cs2/server/game/csgo/addons/counterstrikesharp
readonly PLUGIN_DIR="$CSS_DIR/plugins/CarbonStealth"
readonly CONFIG_DIR="$CSS_DIR/configs/plugins/CarbonStealth"
readonly ENV_FILE=/etc/cs2/cs2.env
readonly LOCK=/run/cs2dm-update.lock
readonly MODS_CACHE=/var/cache/cs2dm/mods
# .NET SDK 10.0.402 (= plugins/global.json). Нов SDK → нов digest, проверен на ръка.
readonly SDK_IMAGE="mcr.microsoft.com/dotnet/sdk:10.0.402@sha256:747cbade5bfd918a175ac32f8f1d931edec2c7d0d5397a3de72eaef1ac1f66d2"

log()  { printf '\n\033[36m[cs2dm-plugins]\033[0m %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[31m[cs2dm-plugins] СТОП:\033[0m %s\n' "$*" >&2; exit 1; }

# Стойност от cs2.env без околните кавички (systemd ги маха; ние — също).
env_value() {
  local v
  v="$(sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -1 || true)"
  v="${v%\"}"; v="${v#\"}"
  printf '%s' "$v"
}

[[ $EUID -eq 0 ]] || die "пусни го със sudo"
[[ -d "$CSS_DIR" ]] || die "няма CounterStrikeSharp — първо install-mods.sh"
[[ -f "$ENV_FILE" ]] || die "липсва $ENV_FILE"
command -v node >/dev/null || die "липсва node (инсталира го install.sh)"

mode=all
case "${1:-}" in
  --config) mode=config ;;
  "") ;;
  *) die "непознат аргумент: $1" ;;
esac

exec 9>"$LOCK"
flock -n 9 || die "друга инсталация/ъпдейт тече — опитай след малко"

build=""
tmp=""
cleanup() { rm -rf "$build" "$tmp"; }
trap cleanup EXIT

db="$(env_value CS2DM_DB_CONNECTION)"
[[ -n "$db" ]] || die "CS2DM_DB_CONNECTION е празен в $ENV_FILE — първо базата на приложението (виж cs2.env.example)"

if [[ "$mode" == all ]]; then
  log "Билд"
  install -d -m 0755 /var/cache/cs2dm
  build="$(mktemp -d /var/cache/cs2dm/build.XXXXXX)"
  cp -r "$PLUGIN_SRC" "$build/plugins"
  rm -rf "$build/plugins/bin" "$build/plugins/obj" "$build/plugins/out" "$build/plugins/lib"
  install -d "$build/server/mods"
  install -m 0644 "$SRC_DIR/mods.lock" "$build/server/mods/mods.lock"
  # DeathmatchAPI.dll — от архива, който install-mods.sh вече провери по sha256 (без второ теглене).
  dm_ver="$(awk -F'\t' '$1 == "deathmatch" { print $2 }' "$SRC_DIR/mods.lock")"
  dm_sha="$(awk -F'\t' '$1 == "deathmatch" { print $4 }' "$SRC_DIR/mods.lock")"
  dm_zip="$MODS_CACHE/deathmatch-$dm_ver.zip"
  if [[ -f "$dm_zip" ]]; then
    sha256sum --quiet -c <<<"$dm_sha  $dm_zip" || die "кешираният Deathmatch.zip не съвпада с mods.lock"
    install -d "$build/plugins/lib"
    unzip -q -j "$dm_zip" 'addons/counterstrikesharp/shared/DeathmatchAPI/DeathmatchAPI.dll' -d "$build/plugins/lib"
  fi
  if command -v dotnet >/dev/null; then
    (cd "$build/plugins" && bash scripts/build.sh) || die "билдът се провали (виж изхода по-горе)"
  elif command -v docker >/dev/null; then
    docker run --rm -v "$build:/src" -w /src/plugins \
      -e DOTNET_CLI_TELEMETRY_OPTOUT=1 -e DOTNET_NOLOGO=1 \
      "$SDK_IMAGE" bash scripts/build.sh || die "билдът в контейнера се провали"
  else
    die "няма нито dotnet, нито docker за билда"
  fi
  [[ -f "$build/plugins/out/CarbonStealth/CarbonStealth.dll" ]] || die "билдът не даде CarbonStealth.dll"
  ok "CarbonStealth.dll (тестовете на логиката минаха)"

  log "Инсталиране в $PLUGIN_DIR"
  install -d -o "$CS2_USER" -g "$CS2_USER" -m 0755 "$CSS_DIR/plugins"
  rm -rf "$PLUGIN_DIR.new"
  cp -r "$build/plugins/out/CarbonStealth" "$PLUGIN_DIR.new"
  rm -rf "$PLUGIN_DIR"
  mv "$PLUGIN_DIR.new" "$PLUGIN_DIR"
  chown -R "$CS2_USER:$CS2_USER" "$PLUGIN_DIR"
  ok "файловете са на място"
fi

log "Конфиг (0600, само за $CS2_USER)"
install -d -o "$CS2_USER" -g "$CS2_USER" -m 0750 "$CONFIG_DIR"
tmp="$(mktemp "$CONFIG_DIR/.cfg.XXXXXX")"
CS2DM_DB_CONNECTION="$db" \
CS2DM_REDIS_CONNECTION="$(env_value CS2DM_REDIS_CONNECTION)" \
CS2DM_BRIDGE_KEY="$(env_value CS2DM_BRIDGE_KEY)" \
CS2DM_SITE_URL="$(env_value CS2DM_SITE_URL)" \
CS2DM_PUBLIC_SLOTS="$(env_value CS2DM_PUBLIC_SLOTS)" \
CS2DM_ADVERT_SECONDS="$(env_value CS2DM_ADVERT_SECONDS)" \
CS2DM_BANNER_MODELS="$(env_value CS2DM_BANNER_MODELS)" \
  node "$SRC_DIR/plugin-config.mjs" >"$tmp"
chown "$CS2_USER:$CS2_USER" "$tmp"
chmod 0600 "$tmp"
mv "$tmp" "$CONFIG_DIR/CarbonStealth.json"
ok "CarbonStealth.json"
bridge="$(env_value CS2DM_BRIDGE_KEY)"
(( ${#bridge} >= 32 )) || warn "CS2DM_BRIDGE_KEY липсва/къс — мостът към сайта е изключен (openssl rand -hex 32)"

log "Рестарт"
since="$(date +%s)"
cs2dm_restart_with_mods_or_fallback || die "модовете не тръгнаха; сървърът върви ванилов. journalctl -u cs2 -n 120 --no-pager"
if cs2dm_plugin_loaded_since "$since" CarbonStealth; then
  ok "CarbonStealth е зареден"
  log "Готово. В играта: !admin · !rank · !report · !banner (HEADADMIN+)."
else
  warn "CarbonStealth не се вижда в лога (DM работи без него). Виж: journalctl -u cs2 -n 200 --no-pager | grep -i carbon"
  exit 1
fi
