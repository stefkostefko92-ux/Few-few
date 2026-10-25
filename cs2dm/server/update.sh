#!/usr/bin/env bash
# update.sh — проверява дали CS2 е на последната версия и обновява при нужда (cs2dm).
#
# Пуска се от cs2-update.timer като root. Остарял сървър изпада от листинга на Valve, затова
# проверката е на всеки 10 минути. Източник на истина: ISteamApps/UpToDateCheck с PatchVersion
# (с ClientVersion API-то грешно връща up_to_date=true).
# Ъпдейтът презаписва gameinfo.gi → редът за Metamod се връща; ако новата версия на играта счупи
# модовете, сървърът тръгва ванилов (cs2dm-lib.sh) и на всеки 6 часа при празен сървър пробва пак
# (CounterStrikeSharp сам си обновява gamedata).
#   update.sh          проверка → ъпдейт само ако версията е остаряла
#   update.sh --force  ъпдейт без проверка
set -euo pipefail

readonly LIB_DIR=/usr/local/lib/cs2dm
# shellcheck source=cs2dm-lib.sh
source "$LIB_DIR/cs2dm-lib.sh"

readonly CS2_USER=cs2
readonly CS2_HOME=/opt/cs2
readonly SERVER_DIR="$CS2_HOME/server"
readonly STEAMCMD="$CS2_HOME/steamcmd/steamcmd.sh"
readonly STEAM_INF="$SERVER_DIR/game/csgo/steam.inf"
readonly CFG_SRC="$LIB_DIR/cfg/gamemode_deathmatch_server.cfg"
readonly CFG_DST="$SERVER_DIR/game/csgo/cfg/gamemode_deathmatch_server.cfg"
readonly LOCK=/run/cs2dm-update.lock
readonly RETRY_BROKEN_AFTER=$((6 * 3600))

log() { printf '[cs2dm-update] %s\n' "$*"; }

exec 9>"$LOCK"
if ! flock -n 9; then
  log "друга инсталация/ъпдейт тече — изход"
  exit 0
fi

if [[ ! -f "$STEAM_INF" ]]; then
  log "играта още не е инсталирана ($STEAM_INF липсва) — изход"
  exit 0
fi

patch_version() { sed -n 's/^PatchVersion=//p' "$STEAM_INF" | tr -d '\r'; }

# Хора на сървъра (A2S: играчи минус ботове). Празен низ = не отговаря.
humans_online() {
  local port
  port="$(sed -n 's/^CS2_PORT=//p' /etc/cs2/cs2.env 2>/dev/null | tail -1 || true)"
  node "$LIB_DIR/health.mjs" 127.0.0.1 "${port:-27015}" 2000 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=JSON.parse(s);process.stdout.write(String(i.players-i.bots))})' \
    || true
}

# Модовете са счупени от предишна версия: при празен сървър и след 6 часа — нов опит.
retry_broken_mods() {
  [[ -f "$CS2DM_MODS_BROKEN" ]] && cs2dm_mods_wanted || return 0
  local age=$(( $(date +%s) - $(stat -c %Y "$CS2DM_MODS_BROKEN") ))
  (( age >= RETRY_BROKEN_AFTER )) || return 0
  [[ "$(humans_online)" == 0 ]] || return 0
  log "нов опит с модовете (счупени от $(cat "$CS2DM_MODS_BROKEN"))"
  touch "$CS2DM_MODS_BROKEN"
  if cs2dm_restart_with_mods_or_fallback; then log "модовете отново работят"; fi
}

if [[ "${1:-}" != "--force" ]]; then
  current="$(patch_version)"
  if [[ -z "$current" ]]; then
    log "няма PatchVersion в $STEAM_INF"
    exit 1
  fi
  if ! response="$(curl -fsS --max-time 20 "https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/?appid=730&version=${current}")"; then
    log "Steam API не отговаря — следващата проверка ще опита пак"
    exit 0
  fi
  if grep -Eq '"up_to_date": ?true' <<<"$response"; then
    retry_broken_mods
    exit 0
  fi
  if ! grep -Eq '"up_to_date": ?false' <<<"$response"; then
    log "неразпознат отговор от Steam: $response"
    exit 0
  fi
  log "версия $current е остаряла: $response"
fi

was_active=0
if systemctl is-active --quiet cs2.service; then was_active=1; fi
systemctl stop cs2.service || true

updated=0
for attempt in 1 2 3; do
  if runuser -u "$CS2_USER" -- env HOME="$CS2_HOME" "$STEAMCMD" \
      +force_install_dir "$SERVER_DIR" +login anonymous +app_update 730 validate +quit; then
    updated=1
    break
  fi
  log "SteamCMD опит $attempt не завърши"
  sleep 10
done

# Нашият cfg — наново след всеки ъпдейт (не е в депото, но не рискуваме).
if [[ -f "$CFG_SRC" ]]; then
  install -o "$CS2_USER" -g "$CS2_USER" -m 0644 "$CFG_SRC" "$CFG_DST"
fi

if [[ "$was_active" == 1 ]]; then
  if cs2dm_restart_with_mods_or_fallback; then
    log "сървърът е горе$(cs2dm_mods_wanted && printf ' с модовете')"
  else
    log "ВНИМАНИЕ: сървърът е горе ванилов или не отговаря — виж journalctl -u cs2"
  fi
fi

if [[ "$updated" != 1 ]]; then
  log "ъпдейтът се провали — сървърът е пуснат на старата версия (ако е вървял)"
  exit 1
fi
log "готово: версия $(patch_version)"
