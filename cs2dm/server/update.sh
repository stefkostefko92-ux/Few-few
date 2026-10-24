#!/usr/bin/env bash
# update.sh — проверява дали CS2 е на последната версия и обновява при нужда (cs2dm).
#
# Пуска се от cs2-update.timer като root. Остарял сървър изпада от листинга на Valve, затова
# проверката е на всеки 10 минути. Източник на истина: ISteamApps/UpToDateCheck с PatchVersion
# (с ClientVersion API-то грешно връща up_to_date=true).
#   update.sh          проверка → ъпдейт само ако версията е остаряла
#   update.sh --force  ъпдейт без проверка
set -euo pipefail

readonly CS2_USER=cs2
readonly CS2_HOME=/opt/cs2
readonly SERVER_DIR="$CS2_HOME/server"
readonly STEAMCMD="$CS2_HOME/steamcmd/steamcmd.sh"
readonly STEAM_INF="$SERVER_DIR/game/csgo/steam.inf"
readonly CFG_SRC=/usr/local/lib/cs2dm/cfg/gamemode_deathmatch_server.cfg
readonly CFG_DST="$SERVER_DIR/game/csgo/cfg/gamemode_deathmatch_server.cfg"
readonly LOCK=/run/cs2dm-update.lock

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
  systemctl start cs2.service
fi

if [[ "$updated" != 1 ]]; then
  log "ъпдейтът се провали — сървърът е пуснат на старата версия (ако е вървял)"
  exit 1
fi
log "готово: версия $(patch_version)"
