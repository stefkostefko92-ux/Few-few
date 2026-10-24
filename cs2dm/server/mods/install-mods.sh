#!/usr/bin/env bash
# install-mods.sh — фаза 2 на cs2dm: Metamod + CounterStrikeSharp + DM плъгин върху сървъра от фаза 1.
#
# Идемпотентен. Всеки архив от mods.lock се проверява по sha256 преди разархивиране (fail closed).
#   sudo bash install-mods.sh            инсталира/обновява модовете и рестартира с тях
#   sudo bash install-mods.sh --disable  маха реда за Metamod → ванилов сървър (файловете остават)
#   sudo bash install-mods.sh --status   какво е състоянието
# Ако модовете не тръгнат, сървърът се връща автоматично към ванилов DM (виж cs2dm-lib.sh).
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SRC_DIR
# shellcheck source=../cs2dm-lib.sh
source "$SRC_DIR/../cs2dm-lib.sh"

readonly CS2_USER=cs2
readonly CSGO_DIR=/opt/cs2/server/game/csgo
readonly CSS_DIR="$CSGO_DIR/addons/counterstrikesharp"
readonly CACHE_DIR=/var/cache/cs2dm/mods
readonly ENV_FILE=/etc/cs2/cs2.env
readonly LOCK=/run/cs2dm-update.lock

log()  { printf '\n\033[36m[cs2dm-mods]\033[0m %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[31m[cs2dm-mods] СТОП:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "пусни го със sudo"
[[ -f "$CSGO_DIR/steam.inf" ]] || die "няма инсталиран сървър — първо фаза 1 (install.sh)"
[[ -f /usr/local/lib/cs2dm/health.mjs ]] || die "липсва /usr/local/lib/cs2dm — първо пусни новия install.sh"

status() {
  log "Състояние"
  if cs2dm_mods_wanted; then ok "модовете са включени"; else warn "модовете са изключени"; fi
  if cs2dm_gameinfo_patched; then ok "gameinfo.gi зарежда Metamod"; else warn "gameinfo.gi НЕ зарежда Metamod (ванилов сървър)"; fi
  if [[ -f "$CS2DM_MODS_BROKEN" ]]; then warn "последно счупени при версия на играта $(cat "$CS2DM_MODS_BROKEN")"; fi
  local name version
  while IFS=$'\t' read -r name version _; do
    [[ -z "$name" || "$name" == \#* ]] && continue
    printf '  · %s %s\n' "$name" "$version"
  done <"$SRC_DIR/mods.lock"
}

case "${1:-}" in
  --status) status; exit 0 ;;
  --disable)
    exec 9>"$LOCK"; flock -n 9 || die "друга инсталация/ъпдейт тече"
    rm -f "$CS2DM_MODS_ENABLED"
    cs2dm_unpatch_gameinfo
    systemctl restart cs2.service
    cs2dm_wait_healthy 180 || die "сървърът не отговаря — journalctl -u cs2 -n 80"
    ok "модовете са изключени — ванилов DM"
    exit 0 ;;
  "") ;;
  *) die "непознат аргумент: $1" ;;
esac

exec 9>"$LOCK"
flock -n 9 || die "друга инсталация/ъпдейт тече — опитай след малко"

log "Пакети"
missing=()
dpkg-query -W -f='${Status}' unzip 2>/dev/null | grep -q 'install ok installed' || missing+=(unzip)
# .NET на CounterStrikeSharp иска ICU; името зависи от версията на Ubuntu (24.04: libicu74, 26.04: libicu78).
if ! ldconfig -p | grep -q 'libicuuc\.so\.[0-9]'; then
  apt-get update -qq
  icu_pkg="$(apt-cache search --names-only '^libicu[0-9]+$' | awk '{print $1}' | sort -V | tail -1)"
  [[ -n "$icu_pkg" ]] || die "не намирам пакет libicuNN в apt"
  missing+=("$icu_pkg")
fi
if (( ${#missing[@]} > 0 )); then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "${missing[@]}"
fi
ok "unzip · libicu"

# Workshop addon-и (банерите-картинки) → MultiAddonManager; без тях той не се слага изобщо.
addons="$(sed -n 's/^CS2_WORKSHOP_ADDONS=//p' "$ENV_FILE" 2>/dev/null | tail -1 || true)"
addons="${addons//\"/}"
if [[ -n "$addons" && ! "$addons" =~ ^[0-9]{6,12}(,[0-9]{6,12})*$ ]]; then
  die "CS2_WORKSHOP_ADDONS: само Workshop ID-та, разделени със запетая (напр. 3456789012)"
fi

log "Изтегляне и проверка (sha256)"
install -d -m 0755 "$CACHE_DIR"
staging="$(mktemp -d /var/cache/cs2dm/staging.XXXXXX)"
trap 'rm -rf "$staging"' EXIT
while IFS=$'\t' read -r name version url sha method; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  [[ "$name" == multiaddonmanager && -z "$addons" ]] && continue
  ext=zip
  [[ "$method" == tar ]] && ext=tar.gz
  file="$CACHE_DIR/$name-$version.$ext"
  if [[ ! -f "$file" ]] || ! sha256sum --quiet -c <<<"$sha  $file" 2>/dev/null; then
    curl -fsSL --retry 3 -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
  if ! sha256sum --quiet -c <<<"$sha  $file"; then
    rm -f "$file"
    die "$name $version: sha256 НЕ съвпада — архивът е подменен или повреден; нищо не е инсталирано"
  fi
  case "$method" in
    tar) tar -xzf "$file" -C "$staging" ;;
    zip) unzip -q -o "$file" -d "$staging" ;;
    *) die "непознат метод „$method“ за $name" ;;
  esac
  ok "$name $version"
done <"$SRC_DIR/mods.lock"

[[ -d "$staging/addons" ]] || die "архивите не съдържат addons/"
log "Инсталиране в $CSGO_DIR/addons"
install -d -o "$CS2_USER" -g "$CS2_USER" -m 0755 "$CSGO_DIR/addons"
cp -r "$staging/addons/." "$CSGO_DIR/addons/"

install -d -m 0755 "$CSS_DIR/configs/plugins/Deathmatch"
install -m 0644 "$SRC_DIR/config/core.json" "$CSS_DIR/configs/core.json"
install -m 0644 "$SRC_DIR/config/Deathmatch.json" "$CSS_DIR/configs/plugins/Deathmatch/Deathmatch.json"

owner="$(sed -n 's/^CS2_OWNER_STEAMID64=//p' "$ENV_FILE" 2>/dev/null | tail -1 || true)"
if [[ "$owner" =~ ^7656119[0-9]{10}$ ]]; then
  printf '{\n  "Owner": {\n    "identity": "%s",\n    "immunity": 100,\n    "flags": [ "@css/root" ]\n  }\n}\n' "$owner" \
    >"$CSS_DIR/configs/admins.json"
  ok "собственик (@css/root): $owner"
else
  warn "CS2_OWNER_STEAMID64 липсва или е невалиден в $ENV_FILE — няма админ в играта засега"
fi
if [[ -n "$addons" ]]; then
  install -d -o "$CS2_USER" -g "$CS2_USER" -m 0755 "$CSGO_DIR/cfg/multiaddonmanager"
  cat >"$CSGO_DIR/cfg/multiaddonmanager/multiaddonmanager.cfg" <<CFG
// Генериран от install-mods.sh (CS2_WORKSHOP_ADDONS в /etc/cs2/cs2.env) — не се редактира на ръка.
mm_extra_addons "$addons"
mm_extra_addons_timeout 10
mm_addon_connection_timeout 30
mm_cache_clients_with_addons 1
mm_cache_clients_duration 0
mm_block_disconnect_messages 1
CFG
  chown "$CS2_USER:$CS2_USER" "$CSGO_DIR/cfg/multiaddonmanager/multiaddonmanager.cfg"
  ok "MultiAddonManager · addon-и: $addons"
else
  rm -f "$CSGO_DIR/addons/metamod/multiaddonmanager.vdf"
fi
chown -R "$CS2_USER:$CS2_USER" "$CSGO_DIR/addons"
ok "core.json (FollowCS2ServerGuidelines=true) · Deathmatch.json"

log "Рестарт с модовете"
install -d -m 0755 "$CS2DM_STATE_DIR"
touch "$CS2DM_MODS_ENABLED"
if cs2dm_restart_with_mods_or_fallback; then
  ok "Metamod → CounterStrikeSharp → Deathmatch заредени"
  log "Готово. В играта: !gun (оръжия), !dm (менюто на Deathmatch)."
else
  die "модовете не тръгнаха; сървърът върви ванилов. Пусни: journalctl -u cs2 -n 120 --no-pager"
fi
