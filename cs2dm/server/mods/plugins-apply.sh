#!/usr/bin/env bash
# plugins-apply.sh — root страната на плъгините от уеб панела (CONTRACT §14).
#
# Пуска го САМО cs2-plugins@<op>-<id>.service (агентът го стартира през polkit); инстанцията е единственият
# вход и се проверява наново тук (fail closed), id — и срещу mods.lock.
#   enable / disable   премества файловете на мода (CSS: plugins/ ↔ plugins/disabled/, Metamod: .vdf ↔
#                      .vdf.disabled) — без рестарт; живият ефект го прави панелът през моста (css_plugins)
#   install / remove   записва решението и пуска install-mods.sh (сваляне, sha256, рестарт); спрян сървър
#                      остава спрян
# Решенията са в /var/lib/cs2dm/plugins.state (removed=…, disabled=…); install-mods.sh ги спазва и при деплой.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SRC_DIR
# shellcheck source=../cs2dm-lib.sh
source "$SRC_DIR/../cs2dm-lib.sh"
# shellcheck source=mods-lib.sh
source "$SRC_DIR/mods-lib.sh"

readonly CS2_USER=cs2
readonly CSGO_DIR="${CS2DM_CSGO_DIR:-/opt/cs2/server/game/csgo}"
readonly ENV_FILE=/etc/cs2/cs2.env
readonly LOCK="${CS2DM_LOCK:-/run/cs2dm-update.lock}"
readonly STATE="$CS2DM_STATE_DIR/plugins.state"

ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '[cs2dm-plugins] СТОП: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 || -n "${CS2DM_TEST:-}" ]] || die "само root (cs2-plugins@.service)"
read -r op id < <(cs2dm_panel_instance "${1:-}" || true) || true
[[ -n "${op:-}" && -n "${id:-}" ]] || die "невалидна инстанция „${1:-}“ (очаквам <install|remove|enable|disable>-<id>)"
awk -F'\t' -v n="$id" '$1 == n { found = 1 } END { exit !found }' "$SRC_DIR/mods.lock" \
  || die "$id го няма в mods.lock"

# Текущите решения: „removed=“ от панела, иначе CS2DM_SKIP_MODS (първото решение от панела тръгва от тях).
if grep -q '^removed=' "$STATE" 2>/dev/null; then
  removed="$(cs2dm_skip_list "$(cs2dm_env_get "$STATE" removed)" "$SRC_DIR/mods.lock")" || die "$STATE: невалиден removed="
else
  removed="$(cs2dm_skip_list "$(cs2dm_env_get "$ENV_FILE" CS2DM_SKIP_MODS)" "$SRC_DIR/mods.lock")" || die "CS2DM_SKIP_MODS е невалиден"
fi
disabled="$(cs2dm_skip_list "$(cs2dm_env_get "$STATE" disabled)" "$SRC_DIR/mods.lock")" || die "$STATE: невалиден disabled="

save_state() {
  install -d -m 0755 "$CS2DM_STATE_DIR"
  local tmp
  tmp="$(mktemp "$CS2DM_STATE_DIR/plugins.state.XXXXXX")"
  printf '# cs2dm — плъгините от панела (CONTRACT §14). Пише го plugins-apply.sh; не се редактира на ръка.\nremoved=%s\ndisabled=%s\n' \
    "$removed" "$disabled" >"$tmp"
  chmod 0644 "$tmp"
  mv -f -- "$tmp" "$STATE"
}

# Премества всеки път на мода от→до (enable: спрян → включен; disable: обратно). Нищо за местене → 1.
move_mod() { # disable|enable
  local rel off from to moved=1
  while IFS= read -r rel; do
    [[ -n "$rel" && "$rel" == addons/* ]] || continue
    off="$(cs2dm_disabled_path "$rel")" || continue
    if [[ "$1" == disable ]]; then from="$rel" to="$off"; else from="$off" to="$rel"; fi
    if [[ -e "$CSGO_DIR/$to" && ! -e "$CSGO_DIR/$from" ]]; then moved=0; continue; fi # вече е там
    [[ -e "$CSGO_DIR/$from" ]] || continue
    rm -rf -- "${CSGO_DIR:?}/$to"
    install -d "$(dirname "$CSGO_DIR/$to")"
    mv -- "$CSGO_DIR/$from" "$CSGO_DIR/$to"
    [[ -n "${CS2DM_TEST:-}" ]] || chown -R "$CS2_USER:$CS2_USER" "$(dirname "$CSGO_DIR/$to")"
    moved=0
  done < <(cs2dm_mod_paths "$id" || true)
  return "$moved"
}

case "$op" in
  enable | disable)
    [[ ",$removed," != *",$id,"* ]] || die "$id не е инсталиран — първо „Инсталирай“"
    exec 9>"$LOCK"
    flock -n 9 || die "друга инсталация/ъпдейт тече — опитай след малко"
    move_mod "$op" || die "$id: файловете липсват — инсталирай го наново"
    if [[ "$op" == disable ]]; then disabled="$(cs2dm_list_add "$disabled" "$id")"; else disabled="$(cs2dm_list_del "$disabled" "$id")"; fi
    save_state
    ok "$id — $op"
    ;;
  install | remove)
    # Заето ли е? install-mods.sh взима същия lock — проверката е тук, за да не запишем решение напразно.
    flock -n "$LOCK" true || die "друга инсталация/ъпдейт тече — опитай след малко"
    if [[ "$op" == remove ]]; then
      removed="$(cs2dm_list_add "$removed" "$id")"
      disabled="$(cs2dm_list_del "$disabled" "$id")"
    else
      removed="$(cs2dm_list_del "$removed" "$id")"
    fi
    save_state
    [[ -z "${CS2DM_TEST:-}" ]] || { ok "$id — $op (тест: без install-mods.sh)"; exit 0; }
    was_active=0
    systemctl is-active --quiet cs2.service && was_active=1
    bash "$SRC_DIR/install-mods.sh"
    # Спрян от панела сървър остава спрян (както update.sh, CONTRACT §9).
    if [[ "$was_active" == 0 ]]; then systemctl stop cs2.service; fi
    ok "$id — $op"
    ;;
esac
