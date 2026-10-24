#!/usr/bin/env bash
# install-agent.sh — cs2-agent: агентът на хоста за уеб панела на cs2dm (CONTRACT.md §9).
#
# Идемпотентен, само като root. Самият агент НЕ е root: потребител cs2agent (системен, без shell),
# polkit право САМО за start/stop/restart на cs2.service и start на cs2-update.service, четене на журнала
# (група systemd-journal) и на логовете на CSS (група cs2) — без запис никъде.
#
# Ключовете (никога не се печатат; файловете са 0600, umask 077):
#   CS2DM_AGENT_KEY   генерира се веднъж; ЕДИН И СЪЩ в /etc/cs2/agent.env и /etc/cs2/app.env
#   CS2DM_BRIDGE_KEY  копие от /etc/cs2/cs2.env в app.env (мостът сайт ↔ плъгин, §5)
#   APP_ENC_KEY       генерира се веднъж в app.env (шифрира TOTP тайните на панела — НИКОГА не се сменя)
# Env файловете се четат със sed, никога със source (cs2.env съдържа „;“ в низа на Npgsql).
#
#   sudo bash install-agent.sh
set -euo pipefail
umask 077

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SRC_DIR
readonly AGENT_USER=cs2agent
readonly NODE=/usr/bin/node
# Пътищата се подменят само от тестовете (през средата).
ENV_DIR="${CS2DM_ENV_DIR:-/etc/cs2}"
LIB_DIR="${CS2DM_LIB_DIR:-/usr/local/lib/cs2dm}"
UNIT_DIR="${CS2DM_UNIT_DIR:-/etc/systemd/system}"
POLKIT_DIR="${CS2DM_POLKIT_DIR:-/etc/polkit-1/rules.d}"
CS2_ENV="$ENV_DIR/cs2.env"
APP_ENV="$ENV_DIR/app.env"
AGENT_ENV="$ENV_DIR/agent.env"
AGENT_DIR="$LIB_DIR/agent"
POLKIT_RULE="$POLKIT_DIR/50-cs2dm-agent.rules"

log()  { printf '\n\033[36m[cs2-agent]\033[0m %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
info() { printf '  · %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[31m[cs2-agent] СТОП:\033[0m %s\n' "$*" >&2; exit 1; }

# Стойност от env файл без околните кавички; липсващ файл/ред → празно. САМО sed — без source.
env_get() {
  local file=$1 name=$2 v
  [[ -f "$file" ]] || return 0
  v="$(sed -n "s/^${name}=//p" "$file" | tail -1)"
  v="${v%$'\r'}"
  if [[ ${#v} -ge 2 && ( ( "$v" == \"*\" ) || ( "$v" == \'*\' ) ) ]]; then v="${v:1:${#v}-2}"; fi
  printf '%s' "$v"
}

# Ключ, който се пренася безопасно в EnvironmentFile и в --env-file на Compose: ≥ 32 знака, без
# кавички, интервали, „$“ и „\“ (openssl rand -hex 32 дава 64 hex).
safe_value() { [[ -n "$1" && "$1" =~ ^[A-Za-z0-9._~+/=-]+$ ]]; }
valid_key() { [[ ${#1} -ge 32 ]] && safe_value "$1"; }

# Задава ИМЕ=стойност във файла (заменя първия ред, маха повторенията, иначе добавя накрая).
# Стойността стига до awk през средата, не като аргумент — не се вижда в /proc/<pid>/cmdline.
set_kv() {
  local file=$1 name=$2 tmp
  tmp="$(mktemp "$file.XXXXXX")"
  KV_NAME="$name" KV_VALUE="$3" awk '
    BEGIN { n = ENVIRON["KV_NAME"]; v = ENVIRON["KV_VALUE"]; done = 0 }
    index($0, n "=") == 1 { if (!done) { print n "=" v; done = 1 } next }
    { print }
    END { if (!done) print n "=" v }
  ' "$file" >"$tmp"
  chown --reference="$file" "$tmp"
  chmod 0600 "$tmp"
  mv -f "$tmp" "$file"
}

# Синхронизира ключовете и пише /etc/cs2/agent.env. Нищо тайно не стига до изхода.
sync_keys() {
  [[ -f "$CS2_ENV" ]] || die "липсва $CS2_ENV — първо server/install.sh"
  [[ -f "$APP_ENV" ]] || die "липсва $APP_ENV — env файлът на сайта (docker compose --env-file $APP_ENV); първо деплой на cs2dm/app с REDIS_PASSWORD в него"

  local agent_key app_key bridge enc redis_pass redis_port cs2_port app_changed=0
  agent_key="$(env_get "$AGENT_ENV" CS2DM_AGENT_KEY)"
  app_key="$(env_get "$APP_ENV" CS2DM_AGENT_KEY)"
  if ! valid_key "$agent_key"; then
    if valid_key "$app_key"; then
      agent_key="$app_key"
    else
      agent_key="$(openssl rand -hex 32)"
      ok "нов CS2DM_AGENT_KEY (openssl rand -hex 32)"
    fi
  fi
  if [[ "$app_key" != "$agent_key" ]]; then
    set_kv "$APP_ENV" CS2DM_AGENT_KEY "$agent_key"
    app_changed=1
  fi
  ok "CS2DM_AGENT_KEY — еднакъв в agent.env и app.env"

  bridge="$(env_get "$CS2_ENV" CS2DM_BRIDGE_KEY)"
  if valid_key "$bridge"; then
    if [[ "$(env_get "$APP_ENV" CS2DM_BRIDGE_KEY)" != "$bridge" ]]; then
      set_kv "$APP_ENV" CS2DM_BRIDGE_KEY "$bridge"
      app_changed=1
    fi
    ok "CS2DM_BRIDGE_KEY — app.env = cs2.env"
  else
    warn "CS2DM_BRIDGE_KEY липсва/къс в $CS2_ENV — мостът сайт ↔ плъгин остава изключен (виж cs2.env.example)"
  fi

  enc="$(env_get "$APP_ENV" APP_ENC_KEY)"
  if [[ -z "$enc" ]]; then
    set_kv "$APP_ENV" APP_ENC_KEY "$(openssl rand -hex 32)"
    app_changed=1
    ok "нов APP_ENC_KEY в app.env — НИКОГА не го сменяй (с него са шифрирани TOTP тайните)"
  elif valid_key "$enc"; then
    ok "APP_ENC_KEY — вече е зададен (не се пипа)"
  else
    warn "APP_ENC_KEY в $APP_ENV е под 32 знака или с непозволени знаци — НЕ го пипам (шифрираните данни зависят от него)"
  fi

  redis_pass="$(env_get "$APP_ENV" REDIS_PASSWORD)"
  [[ -n "$redis_pass" ]] || die "REDIS_PASSWORD е празен в $APP_ENV — Redis на сайта е с парола (openssl rand -hex 32)"
  safe_value "$redis_pass" || die "REDIS_PASSWORD в $APP_ENV има знаци, които не се пренасят безопасно в EnvironmentFile — openssl rand -hex 32"
  (( ${#redis_pass} >= 32 )) || warn "REDIS_PASSWORD в $APP_ENV е под 32 знака — препоръчително: openssl rand -hex 32"
  redis_port="$(env_get "$APP_ENV" REDIS_PORT)"
  redis_port="${redis_port:-6392}"
  [[ "$redis_port" =~ ^[0-9]{1,5}$ ]] || die "REDIS_PORT в $APP_ENV не е порт"
  cs2_port="$(env_get "$CS2_ENV" CS2_PORT)"
  cs2_port="${cs2_port:-27015}"
  [[ "$cs2_port" =~ ^[0-9]{1,5}$ ]] || die "CS2_PORT в $CS2_ENV не е порт"

  # Целият agent.env наново, атомарно (mktemp е 0600). Само каквото агентът ползва.
  local tmp
  tmp="$(mktemp "$ENV_DIR/.agent.env.XXXXXX")"
  {
    printf '# %s — генериран от server/agent/install-agent.sh; 0600 root. Не се редактира на ръка.\n' "$AGENT_ENV"
    printf 'CS2DM_AGENT_KEY=%s\n' "$agent_key"
    printf 'CS2DM_REDIS_HOST=127.0.0.1\n'
    printf 'CS2DM_REDIS_PORT=%s\n' "$redis_port"
    printf 'CS2DM_REDIS_PASSWORD=%s\n' "$redis_pass"
    printf 'CS2_PORT=%s\n' "$cs2_port"
  } >"$tmp"
  chmod 0600 "$tmp"
  mv -f "$tmp" "$AGENT_ENV"
  ok "$AGENT_ENV (0600) · Redis 127.0.0.1:$redis_port · A2S порт $cs2_port"

  if (( app_changed )); then
    info "app.env е променен → презареди сайта (docker compose --env-file $APP_ENV … up -d), за да види ключовете"
  fi
}

preflight() {
  log "Проверки"
  [[ $EUID -eq 0 ]] || die "пусни го със sudo"
  [[ -f "$CS2_ENV" ]] || die "липсва $CS2_ENV — първо server/install.sh"
  [[ -f "$APP_ENV" ]] || die "липсва $APP_ENV — env файлът на сайта (docker compose --env-file $APP_ENV); първо деплой на cs2dm/app с REDIS_PASSWORD в него"
  ok "$CS2_ENV · $APP_ENV"
  [[ -x "$NODE" ]] || die "няма $NODE — агентът иска Node ≥ 20 на това място (unit-ът го пуска оттам)"
  local major
  major="$("$NODE" -p 'process.versions.node.split(".")[0]')"
  (( major >= 20 )) || die "Node $major е стар — агентът иска ≥ 20"
  ok "Node $major ($NODE)"
  command -v openssl >/dev/null || die "липсва openssl (за генериране на ключовете)"
  command -v systemctl >/dev/null || die "липсва systemctl"
  [[ -f "$LIB_DIR/a2s.mjs" || -f "$SRC_DIR/../a2s.mjs" ]] || die "липсва a2s.mjs"
  getent group systemd-journal >/dev/null || die "няма група systemd-journal"
  getent group cs2 >/dev/null || die "няма група cs2 — първо server/install.sh"
  ok "групи systemd-journal · cs2"
}

# polkit ≥ 121 (JavaScript правила). 0.105 (Ubuntu 22.04) не може да ограничи по unit и verb → отказ.
ensure_polkit() {
  log "polkit"
  local ver=""
  if dpkg-query -W -f='${Status}' polkitd 2>/dev/null | grep -q 'install ok installed'; then
    ver="$(dpkg-query -W -f='${Version}' polkitd)"
  else
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends polkitd \
      || die "polkitd не се инсталира — агентът няма как да получи право само за двата unit-а"
    ver="$(dpkg-query -W -f='${Version}' polkitd)"
  fi
  dpkg --compare-versions "$ver" ge 121 \
    || die "polkit $ver е без JavaScript правила (нужен е ≥ 121 — Ubuntu 24.04+)"
  ok "polkitd $ver"
}

ensure_user() {
  log "Потребител"
  if ! id -u "$AGENT_USER" >/dev/null 2>&1; then
    useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$AGENT_USER"
  fi
  # Идемпотентно: без shell, каквото и да е било преди (паролата на системния потребител е заключена от useradd).
  usermod --shell /usr/sbin/nologin "$AGENT_USER"
  ok "$AGENT_USER (системен, без shell; групите systemd-journal и cs2 — само в unit-а)"
}

install_files() {
  log "Файлове"
  # Root:root, извън дома на когото и да е — cs2agent не може да подмени кода, който тича.
  install -d -o root -g root -m 0755 "$LIB_DIR" "$AGENT_DIR"
  install -o root -g root -m 0644 "$SRC_DIR/../a2s.mjs" "$LIB_DIR/a2s.mjs"
  install -o root -g root -m 0644 "$SRC_DIR/cs2-agent.mjs" "$AGENT_DIR/cs2-agent.mjs"
  ok "$AGENT_DIR/cs2-agent.mjs · $LIB_DIR/a2s.mjs"

  install -d -m 0700 "$ENV_DIR"
  sync_keys
  chown root:root "$AGENT_ENV"
  chmod 0600 "$AGENT_ENV" "$APP_ENV"

  install -o root -g root -m 0644 "$SRC_DIR/cs2-agent.service" "$UNIT_DIR/cs2-agent.service"
  # Папката може да е root:polkitd 0750 — не сменяме правата ѝ, ако я има.
  [[ -d "$POLKIT_DIR" ]] || install -d -m 0755 "$POLKIT_DIR"
  install -o root -g root -m 0644 "$SRC_DIR/50-cs2dm-agent.rules" "$POLKIT_RULE"
  ok "cs2-agent.service · $POLKIT_RULE (polkitd презарежда правилата сам)"
}

# Работи ли агентът след рестарт (health): активен 3 s по-късно, после подписан status/logs.
agent_health() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if systemctl is-active --quiet cs2-agent.service; then break; fi
    sleep 1
  done
  sleep 3
  if ! systemctl is-active --quiet cs2-agent.service; then
    journalctl -u cs2-agent.service -n 30 --no-pager || true
    die "cs2-agent не върви — логът е горе"
  fi
  ok "cs2-agent.service е активен"
  if "$NODE" "$AGENT_DIR/cs2-agent.mjs" --selftest "$AGENT_ENV"; then
    ok "самопроверка: агентът отговаря на подписани команди"
  else
    warn "самопроверката не мина — ако сайтът (Redis) още не е горе, агентът ще се свърже сам; иначе: journalctl -u cs2-agent -n 50"
  fi
}

# Правото през polkit, без да пипаме играта: pkcheck за процеса на агента с детайлите unit/verb.
check_polkit() {
  local pid
  if ! command -v pkcheck >/dev/null; then
    warn "няма pkcheck — правото в polkit не е проверено (първият рестарт от панела ще покаже)"
    return 0
  fi
  pid="$(systemctl show -p MainPID --value cs2-agent.service)"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || { warn "няма PID на агента — polkit не е проверен"; return 0; }
  local unit verb pair
  pk() { pkcheck --action-id org.freedesktop.systemd1.manage-units --process "$pid" --detail unit "$1" --detail verb "$2" >/dev/null 2>&1; }
  for pair in "cs2.service start" "cs2.service stop" "cs2.service restart" "cs2-update.service start"; do
    read -r unit verb <<<"$pair"
    if pk "$unit" "$verb"; then ok "polkit: $verb $unit — разрешено"; else warn "polkit: $verb $unit — ОТКАЗАНО (панелът няма да може)"; fi
  done
  for pair in "cs2.service reload" "cs2.service kill" "cs2-update.service restart" "ssh.service restart" "cs2-agent.service stop"; do
    read -r unit verb <<<"$pair"
    if pk "$unit" "$verb"; then
      systemctl stop cs2-agent.service
      die "polkit разрешава $verb $unit на $AGENT_USER — агентът е спрян; провери /etc/polkit-1/rules.d"
    fi
  done
  ok "polkit: всичко друго е отказано"
}

main() {
  (( $# == 0 )) || die "непознат аргумент: $1 (скриптът е без аргументи)"
  preflight
  ensure_polkit
  ensure_user
  install_files
  log "Старт"
  systemctl daemon-reload
  systemctl enable --quiet cs2-agent.service
  systemctl restart cs2-agent.service
  agent_health
  check_polkit
  log "Готово"
  info "логове:   journalctl -u cs2-agent -f"
  info "проверка: sudo $NODE $AGENT_DIR/cs2-agent.mjs --selftest"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
