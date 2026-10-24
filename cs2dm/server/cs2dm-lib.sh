#!/usr/bin/env bash
# deploy-check: allow-no-errexit — библиотека; зарежда се със source от скриптове със set -euo pipefail
# cs2dm-lib.sh — общи функции за install.sh, install-mods.sh и update.sh (source, не се пуска сам).
#
# Модовете (Metamod + CounterStrikeSharp + плъгини) се зареждат през един ред в gameinfo.gi.
# Всеки ъпдейт на CS2 презаписва gameinfo.gi, затова редът се връща след всеки ъпдейт — а ако
# новата версия на играта счупи модовете, сървърът тръгва „ванилов“ (DM е вграден режим) и
# състоянието се отбелязва, вместо да лежи.

[[ -n "${CS2DM_LIB_LOADED:-}" ]] && return 0
CS2DM_LIB_LOADED=1

# Пътищата се подменят само от тестовете (през средата).
CS2DM_GAMEINFO="${CS2DM_GAMEINFO:-/opt/cs2/server/game/csgo/gameinfo.gi}"
CS2DM_STATE_DIR="${CS2DM_STATE_DIR:-/var/lib/cs2dm}"
CS2DM_MODS_ENABLED="$CS2DM_STATE_DIR/mods-enabled"
CS2DM_MODS_BROKEN="$CS2DM_STATE_DIR/mods-broken"
CS2DM_METAMOD_LINE=$'\t\t\tGame\tcsgo/addons/metamod'
# Логовете на CounterStrikeSharp (Serilog, по ден: log-all<ггггммдд>.txt).
CS2DM_CSS_LOGS="${CS2DM_CSS_LOGS:-/opt/cs2/server/game/csgo/addons/counterstrikesharp/logs}"
# Плъгинът, чието зареждане доказва, че цялата верига работи (Metamod → CSS → плъгин).
CS2DM_PROBE_PLUGIN="Deathmatch"

cs2dm_mods_wanted() { [[ -f "$CS2DM_MODS_ENABLED" ]]; }

cs2dm_gameinfo_patched() { grep -Eq '^[[:space:]]*Game[[:space:]]+csgo/addons/metamod[[:space:]]*$' "$CS2DM_GAMEINFO"; }

# Добавя реда за Metamod точно под „Game_LowViolence csgo_lv“ (по инструкциите на CSS). Идемпотентно.
cs2dm_patch_gameinfo() {
  if cs2dm_gameinfo_patched; then return 0; fi
  if ! grep -Eq '^[[:space:]]*Game_LowViolence[[:space:]]+csgo_lv' "$CS2DM_GAMEINFO"; then
    printf '[cs2dm] gameinfo.gi няма ред „Game_LowViolence csgo_lv“ — Valve е сменила формата\n' >&2
    return 1
  fi
  local tmp
  tmp="$(mktemp "$CS2DM_GAMEINFO.XXXXXX")"
  awk -v line="$CS2DM_METAMOD_LINE" '
    { print }
    !done && /^[[:space:]]*Game_LowViolence[[:space:]]+csgo_lv/ { print line; done = 1 }
  ' "$CS2DM_GAMEINFO" >"$tmp"
  chown --reference="$CS2DM_GAMEINFO" "$tmp"
  chmod --reference="$CS2DM_GAMEINFO" "$tmp"
  mv "$tmp" "$CS2DM_GAMEINFO"
}

cs2dm_unpatch_gameinfo() {
  if ! cs2dm_gameinfo_patched; then return 0; fi
  sed -i -E '/^[[:space:]]*Game[[:space:]]+csgo\/addons\/metamod[[:space:]]*$/d' "$CS2DM_GAMEINFO"
}

# Чака A2S отговор до $1 секунди. 0 = отговаря.
cs2dm_wait_healthy() {
  local timeout=$1 port waited=0
  port="$(sed -n 's/^CS2_PORT=//p' /etc/cs2/cs2.env 2>/dev/null | tail -1 || true)"
  port="${port:-27015}"
  while (( waited < timeout )); do
    if node /usr/local/lib/cs2dm/health.mjs 127.0.0.1 "$port" 2000 >/dev/null 2>&1; then return 0; fi
    if ! systemctl is-active --quiet cs2.service; then return 1; fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

# Зареден ли е плъгинът $2 след момента $1 (epoch секунди)?
# Основният източник е логът на CSS във файл: stdout на играта към journald се буферира и редът
# може да не стигне навреме (на VPS-а 24.10.2026 плъгините се заредиха, а проверката ги изпусна).
cs2dm_plugin_loaded_since() {
  cs2dm_css_log_since "$1" "$2" && return 0
  journalctl -u cs2.service --since "@$1" --no-pager -o cat 2>/dev/null \
    | grep -q "Finished loading plugin $2"
}

# Ред „Finished loading plugin $2“ с час ≥ $1 в log-all*.txt („2026-10-24 15:01:58.441 +02:00 [INFO] …“).
cs2dm_css_log_since() {
  local since=$1 name=$2 f line at
  for f in "$CS2DM_CSS_LOGS"/log-all*.txt; do
    [[ -f "$f" ]] || continue
    while IFS= read -r line; do
      at="$(date -d "${line:0:30}" +%s 2>/dev/null)" || continue
      (( at >= since )) && return 0
    done < <(grep -F "Finished loading plugin $name" "$f" 2>/dev/null || true)
  done
  return 1
}

cs2dm_mods_loaded_since() { cs2dm_plugin_loaded_since "$1" "$CS2DM_PROBE_PLUGIN"; }

# Рестарт с модове; при провал — ванилов старт и отбелязване. 0 = модовете работят.
cs2dm_restart_with_mods_or_fallback() {
  local since
  install -d -m 0755 "$CS2DM_STATE_DIR"
  if ! cs2dm_mods_wanted; then
    systemctl restart cs2.service
    cs2dm_wait_healthy 180
    return
  fi
  cs2dm_patch_gameinfo
  since="$(date +%s)"
  systemctl restart cs2.service
  if cs2dm_wait_healthy 180 && sleep 20 && cs2dm_mods_loaded_since "$since"; then
    rm -f "$CS2DM_MODS_BROKEN"
    return 0
  fi
  printf '[cs2dm] модовете не тръгнаха — ванилов старт (DM без нашите функции)\n' >&2
  journalctl -u cs2.service --since "@$since" --no-pager -o cat 2>/dev/null | tail -40 >&2 || true
  sed -n 's/^PatchVersion=//p' /opt/cs2/server/game/csgo/steam.inf | tr -d '\r' >"$CS2DM_MODS_BROKEN"
  cs2dm_unpatch_gameinfo
  systemctl restart cs2.service
  cs2dm_wait_healthy 180 || true
  return 1
}
