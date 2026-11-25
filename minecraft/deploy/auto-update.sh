#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# minecraft/deploy/auto-update.sh — автоматичен ъпдейт на Paper до най-новия STABLE build (за същата
# версия на Minecraft). Пуска го minecraft-update.timer всяка нощ; може и ръчно.
#
#   sudo MC_NAME="Custom Mafia" bash minecraft/deploy/auto-update.sh --install   # веднъж: таймер + копие
#   sudo systemctl start minecraft-update.service                                # ръчно, извън графика
#   journalctl -u minecraft-update -n 50                                         # какво е станало
#
# Ред: най-новият build от Paper API → jar-ът вече е той? край. Има ли играчи онлайн? пропуска до
# следващия път (никой не се изритва). Иначе: спира сървъра → switch-flavor.sh (бекъп на панела и на
# целия сървър, нов server.jar, проверка по sha256) → пуска го отново, ако е вървял.
# При провал със стария jar сървърът се пуска пак; с непроверен нов jar остава спрян.
# Светът, админите, whitelist-ът, плъгините и настройките не се пипат — сменя се само server.jar.
# ─────────────────────────────────────────────────────────────────────────────
# shellcheck disable=SC1111 # „…“ са български кавички в текста, не синтаксис.
set -euo pipefail
umask 077

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Името от командния ред/средата важи; иначе остава записаното в /etc/default/minecraft-update.
MC_NAME_GIVEN="${MC_NAME+x}"
MC_BUILD="${MC_BUILD:-latest}"
# shellcheck source=common.sh
. "$SRC_DIR/common.sh"

INSTALL_DIR="$PELICAN_DIR/deploy"
DEFAULTS_FILE=/etc/default/minecraft-update
STOP_WAIT="${STOP_WAIT:-180}"

# Броят играчи онлайн (Server List Ping към играта на този хост). Неуспех = сървърът не отговаря.
players_online() {
  python3 -I - "$GAME_PORT" <<'PY'
import json, socket, struct, sys

def varint(n):
    out = b""
    while True:
        b, n = n & 0x7F, n >> 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out

def read_varint(sock):
    n = shift = 0
    while True:
        b = sock.recv(1)
        if not b:
            raise EOFError
        n |= (b[0] & 0x7F) << shift
        shift += 7
        if not b[0] & 0x80:
            return n

host, port = "127.0.0.1", int(sys.argv[1])
with socket.create_connection((host, port), timeout=10) as s:
    hs = varint(0) + varint(767) + varint(len(host)) + host.encode() + struct.pack(">H", port) + varint(1)
    s.sendall(varint(len(hs)) + hs + varint(1) + varint(0))
    read_varint(s)  # дължина на пакета
    read_varint(s)  # id
    size, data = read_varint(s), b""
    while len(data) < size:
        chunk = s.recv(size - len(data))
        if not chunk:
            raise EOFError
        data += chunk
print(int(json.loads(data)["players"]["online"]))
PY
}

container_running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || echo false)" = true ]; }

power() {
  POWER_ACTION="$1" bootstrap power >/dev/null || fail "панелът не изпрати „$1“ към Wings"
}

install_self() {
  [ "$(id -u)" -eq 0 ] || fail "пусни като root (sudo)"
  command -v python3 >/dev/null || fail "трябва python3 (Server List Ping и Paper API)"
  install -d -m 700 "$INSTALL_DIR"
  if [ "$SRC_DIR" != "$INSTALL_DIR" ]; then
    install -m 600 "$SRC_DIR/common.sh" "$INSTALL_DIR/"
    # 644: PHP в контейнера на панела не е root; файлът няма тайни.
    install -m 644 "$SRC_DIR/bootstrap.php" "$INSTALL_DIR/"
    install -m 700 "$SRC_DIR/switch-flavor.sh" "$SRC_DIR/auto-update.sh" "$INSTALL_DIR/"
    install -m 700 "$SRC_DIR/backup.sh" "$PELICAN_DIR/backup.sh"
  fi
  if [ -n "$MC_NAME_GIVEN" ] || [ ! -f "$DEFAULTS_FILE" ]; then
    case "$MC_NAME" in *'"'* | *$'\n'*) fail "MC_NAME не може да съдържа кавички или нов ред" ;; esac
    printf '# Сървърът в панела, който minecraft-update.timer обновява.\nMC_NAME="%s"\n' "$MC_NAME" > "$DEFAULTS_FILE"
    chmod 644 "$DEFAULTS_FILE"
  fi
  install -m 644 "$SRC_DIR/systemd/minecraft-update.service" /etc/systemd/system/minecraft-update.service
  install -m 644 "$SRC_DIR/systemd/minecraft-update.timer" /etc/systemd/system/minecraft-update.timer
  systemctl daemon-reload
  systemctl enable --now --quiet minecraft-update.timer
  ok "автоматичният ъпдейт е включен за „$(sed -n 's/^MC_NAME="\(.*\)"$/\1/p' "$DEFAULTS_FILE")“ — всяка нощ в 05:30 (София)"
  systemctl list-timers minecraft-update.timer --no-pager | head -n 2
}

main() {
  [ "$(id -u)" -eq 0 ] || fail "пусни като root (sudo)"
  "${COMPOSE[@]}" ps --status running panel 2>/dev/null | grep -q panel || fail "панелът не върви"
  [ "$MC_FLAVOR" = paper ] || { ok "MC_FLAVOR=$MC_FLAVOR — автоматичният ъпдейт е само за Paper"; exit 0; }

  local info uuid status vol old_sha was_running=0 n rc=0
  info="$(server_info)"
  uuid="$(field SERVER_UUID "$info")"
  status="$(field SERVER_STATUS "$info")"
  [[ "$uuid" =~ ^[0-9a-f-]{36}$ ]] || fail "неочаквано UUID на сървъра: '$uuid'"
  [ "$status" = installed ] || { warn "сървърът е в състояние „$status“ — пропускам"; exit 0; }
  vol="$WINGS_VOLUMES/$uuid"
  [ -f "$vol/server.jar" ] || fail "няма $vol/server.jar"

  resolve_latest_build
  if jar_is_target "$vol"; then
    ok "„$MC_NAME“ вече е на Paper $MC_VERSION-$MC_BUILD — няма какво да се прави"
    exit 0
  fi
  old_sha="$(sha256sum "$vol/server.jar" | cut -d' ' -f1)"

  if container_running "$uuid"; then
    n="$(players_online)" || { warn "сървърът върви, но не отговаря на порт $GAME_PORT — пропускам"; exit 0; }
    if [ "$n" -gt 0 ]; then
      ok "$n играч(и) онлайн — ъпдейтът до $MC_BUILD чака следващото пускане"
      exit 0
    fi
    was_running=1
    log "никой не играе — спирам „$MC_NAME“ за ъпдейт до Paper $MC_VERSION-$MC_BUILD"
    power stop
    for ((i = 0; i < STOP_WAIT; i += 5)); do container_running "$uuid" || break; sleep 5; done
    container_running "$uuid" && { power start; fail "сървърът не спря за ${STOP_WAIT}s — оставен работещ, ъпдейтът е пропуснат"; }
  fi

  MC_BUILD="$MC_BUILD" PAPER_SHA256="$PAPER_SHA256" bash "$SRC_DIR/switch-flavor.sh" || rc=$?

  if [ "$rc" -ne 0 ]; then
    if [ "$was_running" = 1 ] && [ "$(sha256sum "$vol/server.jar" | cut -d' ' -f1)" = "$old_sha" ]; then
      power start
      fail "ъпдейтът се провали (виж по-горе) — сървърът е пуснат пак на стария build"
    fi
    fail "ъпдейтът се провали (виж по-горе) — сървърът остава спрян; бекъпът е в /var/backups/minecraft-world"
  fi
  if [ "$was_running" = 1 ]; then
    power start
    ok "„$MC_NAME“ е пуснат пак на Paper $MC_VERSION-$MC_BUILD"
  else
    ok "„$MC_NAME“ е на Paper $MC_VERSION-$MC_BUILD (беше спрян — остава спрян)"
  fi
}

case "${1:-}" in
  --install) install_self ;;
  '') main ;;
  *) fail "непознат аргумент: $1 (позволено: --install)" ;;
esac
