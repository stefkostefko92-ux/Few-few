#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# minecraft/deploy/switch-flavor.sh — съществуващият сървър минава на Paper (или обратно на Vanilla),
# без да губи свят, админи (ops.json), whitelist, банове и server.properties. Идемпотентен.
#
#   sudo bash minecraft/deploy/switch-flavor.sh                    # → Paper (MC_VERSION/MC_BUILD от common.sh)
#   sudo MC_BUILD=latest bash minecraft/deploy/switch-flavor.sh    # → най-новият STABLE build на Paper
#   sudo MC_FLAVOR=vanilla bash minecraft/deploy/switch-flavor.sh  # → обратно на Vanilla (виж README.md)
# Сървърът се избира по име в панела: MC_NAME="…" (по подразбиране „Minecraft“).
#
# Ред: сървърът трябва да е спрян → бекъп на панела (backup.sh) → бекъп на целия сървър (свят + конфиги)
# в /var/backups/minecraft-world → egg-ът в панела се сменя (bootstrap.php switch) → Wings преинсталира:
# инсталаторът на egg-а сменя само server.jar → проверка на jar-а по sha256. Сървърът НЕ се пуска —
# пуска го човек от панела и гледа конзолата.
# Изход: 0 — готово; 1 — спрян (при провал преди смяната нищо не е пипано).
# ─────────────────────────────────────────────────────────────────────────────
# shellcheck disable=SC1111 # „…“ са български кавички в текста, не синтаксис.
set -euo pipefail
umask 077

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "$SRC_DIR/common.sh"

WORLD_BACKUP_DIR="${WORLD_BACKUP_DIR:-/var/backups/minecraft-world}"
KEEP_WORLD_BACKUPS="${KEEP_WORLD_BACKUPS:-5}"
INSTALL_WAIT="${INSTALL_WAIT:-600}"

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

backup_world() {
  local vol="$1" uuid="$2" need_kb avail_kb out
  install -d -m 700 "$WORLD_BACKUP_DIR"
  need_kb="$(du -sk "$vol" | cut -f1)"
  avail_kb="$(df -Pk "$WORLD_BACKUP_DIR" | awk 'NR == 2 {print $4}')"
  # Компресираният архив е по-малък, но свят с много chunk-ове се компресира слабо — искаме пълния размер.
  [ "$avail_kb" -gt "$need_kb" ] || fail "за бекъпа трябват ~$((need_kb / 1024)) MB, свободни са $((avail_kb / 1024)) MB в $WORLD_BACKUP_DIR"
  out="$WORLD_BACKUP_DIR/world-${uuid:0:8}-$(date -u +%Y%m%d-%H%M%S).tar.gz"
  log "бекъп на сървъра (~$((need_kb / 1024)) MB) → $out"
  tar --numeric-owner -czf "$out" -C "$WINGS_VOLUMES" "$uuid"
  tar -tzf "$out" >/dev/null || fail "архивът $out не се чете — нищо не е сменено"
  chmod 600 "$out"
  # Ротация: остават последните $KEEP_WORLD_BACKUPS (имената са сортируеми по време).
  find "$WORLD_BACKUP_DIR" -maxdepth 1 -type f -name "world-${uuid:0:8}-*.tar.gz" -printf '%f\n' | sort \
    | head -n -"$KEEP_WORLD_BACKUPS" | while read -r old; do rm -f -- "${WORLD_BACKUP_DIR:?}/$old"; done
  ok "бекъп: $out"
  WORLD_BACKUP="$out"
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

wait_install() {
  local i status=installing
  log "Wings преинсталира (до ${INSTALL_WAIT}s): сваля се новият jar"
  for ((i = 0; i < INSTALL_WAIT; i += 10)); do
    sleep 10
    status="$(field SERVER_STATUS "$(server_info)")"
    [ "$status" = installing ] || break
  done
  case "$status" in
    installed) ok "инсталацията мина" ;;
    installing) fail "инсталацията не завърши за ${INSTALL_WAIT}s — виж в панела Console (логът на инсталатора)" ;;
    *) fail "инсталацията завърши със „$status“ — виж в панела Console; връщане: README.md → „Paper“" ;;
  esac
}

main() {
  [ "$(id -u)" -eq 0 ] || fail "пусни като root (sudo)"
  "${COMPOSE[@]}" ps --status running panel 2>/dev/null | grep -q panel || fail "панелът не върви — първо install.sh"
  panel_installed || fail "панелът не е минал уеб инсталатора — първо install.sh"

  local info uuid egg status vol out
  info="$(server_info)"
  uuid="$(field SERVER_UUID "$info")"
  egg="$(field SERVER_EGG "$info")"
  status="$(field SERVER_STATUS "$info")"
  [[ "$uuid" =~ ^[0-9a-f-]{36}$ ]] || fail "неочаквано UUID на сървъра: '$uuid'"
  [ "$status" = installed ] || fail "сървърът е в състояние „$status“ — изчакай или го оправи в панела"
  vol="$WINGS_VOLUMES/$uuid"
  [ -d "$vol" ] || fail "няма папка $vol"
  log "сървър „$MC_NAME“ ($uuid): egg „$egg“ → $MC_FLAVOR $MC_VERSION"

  if [ "$(docker inspect -f '{{.State.Running}}' "$uuid" 2>/dev/null || echo false)" = true ]; then
    fail "сървърът върви — спри го от панела (Console → Stop) и пусни скрипта отново"
  fi
  [ -f "$vol/world/level.dat" ] || warn "няма $vol/world/level.dat — светът е с друго име (level-name) или още не е създаван"

  panel_reaches_wings
  resolve_latest_build
  if [ "$MC_FLAVOR" = paper ] && [ -z "$PAPER_SHA256" ]; then
    warn "PAPER_SHA256 е празно — jar-ът няма да бъде проверен"
  fi
  local force=0
  if [ "$MC_FLAVOR" = paper ] && [ -n "$PAPER_SHA256" ] && ! jar_is_target "$vol"; then force=1; fi

  bash "$PELICAN_DIR/backup.sh" || fail "бекъпът на панела се провали — нищо не е сменено"
  WORLD_BACKUP=""
  backup_world "$vol" "$uuid"

  out="$(FORCE_REINSTALL="$force" bootstrap switch)" || { printf '%s\n' "$out" >&2; fail "смяната в панела се провали — сървърът е непроменен (бекъп: $WORLD_BACKUP)"; }
  printf '%s\n' "$out" | grep -v '^SWITCH=' || true
  if printf '%s\n' "$out" | grep -qx 'SWITCH=reinstalling'; then
    wait_install
  fi

  if [ "$MC_FLAVOR" = paper ] && [ -n "$PAPER_SHA256" ]; then
    jar_is_target "$vol" || fail "server.jar не е Paper $MC_VERSION build $MC_BUILD (sha256 не съвпада) — не пускай; бекъп: $WORLD_BACKUP"
    ok "server.jar = Paper $MC_VERSION build $MC_BUILD (sha256 съвпада)"
  fi
  [ -f "$vol/world/level.dat" ] && ok "светът е на място ($vol/world)"
  for f in ops.json whitelist.json server.properties eula.txt; do
    [ -f "$vol/$f" ] || warn "няма $f — ако е имало, върни го от $WORLD_BACKUP"
  done

  cat <<EOF

────────────────────────────────────────────────────────────────────
 Готово. Сървърът е спрян — пусни го от https://$PANEL_FQDN → „$MC_NAME“ → Start.
 При първия старт Paper пренарежда файловете на света (веднъж) и създава plugins/.
 В конзолата: version  → трябва да пише Paper $MC_VERSION.
 Бекъп преди смяната: $WORLD_BACKUP
────────────────────────────────────────────────────────────────────
EOF
}

main "$@"
