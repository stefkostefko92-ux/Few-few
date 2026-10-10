#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/monitoring.sh — включва мониторинга на ChatChat (docker-compose.monitoring.yml):
# Prometheus + Alertmanager (имейл през Brevo) + node-exporter + blackbox + postgres-exporter, и
# дневната проверка на одитната верига. Идемпотентен — повторното пускане само проверява и поправя.
#
#   R="$(cat /opt/few-few/shared/chatchat/last-good)"
#   sudo bash "$R/deploy/monitoring.sh"              # = enable: тайни/папки → COMPOSE_FILE → стек → проверки
#   sudo bash "$R/deploy/monitoring.sh" status       # /-/ready, целите и заредените правила
#   sudo bash "$R/deploy/monitoring.sh" test-email   # пробна аларма → писмо през Brevo (край до край)
#   sudo bash "$R/deploy/monitoring.sh" disable      # маха файла от COMPOSE_FILE и спира стека (данните остават)
#
# Иска (docs/runbook.md, „Включване“): в $SHARED/.env — ALERT_EMAIL_TO (получател) и ALERT_EMAIL_FROM
# (или MAIL_FROM_EMAIL; подател, проверен в Brevo); в $SHARED/monitoring/secrets/ — smtp-user (SMTP login)
# и smtp-password (SMTP ключът от Brevo, НЕ API ключът). Без тях — изход 3 и нищо не тръгва: мониторинг,
# който не може да събуди човек, е самозаблуда. Ролята за postgres-exporter (само pg_monitor) и паролата
# ѝ се раждат тук. Тайните — 400, собственик 65534 (nobody в контейнерите), никога не се печатат.
#
# Изход: 0 — стекът е готов; 3 — липсва настройка (нищо не е пуснато); 1 — грешка.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="${CHATCHAT_SHARED:-/opt/few-few/shared/chatchat}"
MON="$SHARED/monitoring"
SECRETS="$MON/secrets"
TEXTFILE="$MON/textfile"
SYSTEMD_DIR="${CHATCHAT_SYSTEMD_DIR:-/etc/systemd/system}"
SBIN="${CHATCHAT_SBIN:-/usr/local/sbin}"
LAST_GOOD="${CHATCHAT_LAST_GOOD:-$SHARED/last-good}"
WAIT="${CHATCHAT_MONITORING_WAIT:-120}"
OVERLAY=docker-compose.monitoring.yml
NOBODY=65534
EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'
# Имената на job-овете в deploy/monitoring/prometheus.yml — всички трябва да се появят в `up`.
JOBS="chatchat node postgres alertmanager prometheus blackbox-https blackbox-ready blackbox"

log() { printf '\033[1;36m▸ chatchat-monitoring: %s\033[0m\n' "$*"; }
ok() { printf '\033[32m✔ chatchat-monitoring: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ chatchat-monitoring: %s\033[0m\n' "$*" >&2; }
fail() {
  local code="$1"
  shift
  printf '\033[31m✘ chatchat-monitoring: %s\033[0m\n' "$*" >&2
  exit "$code"
}

# Стойност от $SHARED/.env, без файлът да се изпълнява. Не се печата.
env_value() {
  local v
  v="$(sed -n "s/^$1=//p" "$SHARED/.env" | tail -n 1 | tr -d '\r')" || v=""
  v="${v%\"}" && v="${v#\"}" && v="${v%\'}" && v="${v#\'}"
  printf '%s' "$v"
}

valid() { [ "$(printf '%s' "$2" | wc -l)" -eq 0 ] && printf '%s\n' "$2" | grep -Eqx "$1"; }

# COMPOSE_FILE в .env е СПИСЪК (шифрованият том на базата, мониторингът…): добавя/маха само своя файл и
# пази чуждите. Само docker-compose.yml → редът изчезва (това е подразбирането на compose).
compose_file_edit() {
  local f="$1" op="$2" item="$3" cur x has=0
  local -a list out=()
  [ -f "$f" ] || return 0
  cur="$(sed -n 's/^COMPOSE_FILE=//p' "$f" | tail -n 1 | tr -d '\r')"
  IFS=: read -r -a list <<<"${cur:-docker-compose.yml}"
  for x in "${list[@]}"; do
    [ -n "$x" ] || continue
    if [ "$x" = "$item" ]; then has=1; else out+=("$x"); fi
  done
  if [ "$op" = add ]; then
    [ "$has" = 0 ] || return 0
    out+=("$item")
  else
    [ "$has" = 1 ] || return 0
  fi
  {
    grep -v '^COMPOSE_FILE=' "$f" || true
    if [ "${#out[@]}" -gt 1 ] || [ "${out[0]:-docker-compose.yml}" != docker-compose.yml ]; then
      (IFS=: && printf 'COMPOSE_FILE=%s\n' "${out[*]}")
    fi
  } >"$f.tmp"
  chmod 600 "$f.tmp" && mv -f "$f.tmp" "$f"
}

overlay_enabled() { grep -qE "^COMPOSE_FILE=(.*:)?${OVERLAY//./\\.}(:.*)?$" "$SHARED/.env" 2>/dev/null; }

port_of() {
  local p
  p="$(env_value "$1" | tr -dc '0-9')"
  printf '%s' "${p:-$2}"
}

# ── проверки и тайни ──────────────────────────────────────────────────────────────────────────────
preflight() {
  local real live
  [ "$(id -u)" = 0 ] || fail 1 "пусни като root (sudo)."
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    fail 1 "липсва Docker с compose plugin."
  fi
  [ -f "$SHARED/.env" ] || fail 3 "няма $SHARED/.env — първо ChatChat по DEPLOY.md (т. 1, т. 3)."
  [ -f "$APP_DIR/$OVERLAY" ] || fail 1 "няма $APP_DIR/$OVERLAY — този release е отпреди мониторинга."
  # Стекът монтира конфига от папката на release-а: само от работещия, иначе правилата се разминават.
  if [ -f "$LAST_GOOD" ]; then
    live="$(cat "$LAST_GOOD")"
    real="$(cd "$APP_DIR" && pwd -P)"
    [ "$live" = "$real" ] || fail 1 "това не е работещият release ($live) — пусни: sudo bash \"$live/deploy/monitoring.sh\""
  fi
}

check_settings() {
  local to from base missing=""
  to="$(env_value ALERT_EMAIL_TO)"
  from="$(env_value ALERT_EMAIL_FROM)"
  [ -n "$from" ] || from="$(env_value MAIL_FROM_EMAIL)"
  base="$(env_value PUBLIC_BASE_URL)"
  valid "$EMAIL_RE(,$EMAIL_RE)*" "$to" || missing="$missing\n  · ALERT_EMAIL_TO=<имейл>[,<имейл>…] в $SHARED/.env (кой получава алармите)"
  valid "$EMAIL_RE" "$from" || missing="$missing\n  · ALERT_EMAIL_FROM=<подател, проверен в Brevo> в $SHARED/.env (или MAIL_FROM_EMAIL)"
  valid 'https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?' "$base" || missing="$missing\n  · PUBLIC_BASE_URL=https://… в $SHARED/.env (целта на пробата отвън)"
  [ -s "$SECRETS/smtp-user" ] || missing="$missing\n  · SMTP login от Brevo (SMTP & API → SMTP) в $SECRETS/smtp-user"
  [ -s "$SECRETS/smtp-password" ] || missing="$missing\n  · SMTP ключа от Brevo (НЕ API ключа) в $SECRETS/smtp-password"
  [ -z "$missing" ] && return 0
  printf '%b\n' "Липсва настройка — мониторингът НЕ е пуснат:$missing" >&2
  printf '%s\n' "Тайните: sudoedit <файла> (създаден е празен, 400, собственик $NOBODY). После пак този скрипт." >&2
  exit 3
}

# Папките и файловете с тайни: правата се налагат при всеки пробег (идемпотентно).
ensure_files() {
  local f
  install -d -m 755 "$MON" "$TEXTFILE"
  install -d -m 700 "$SECRETS"
  for f in smtp-user smtp-password pg-monitor-password; do
    [ -e "$SECRETS/$f" ] || install -m 400 -o "$NOBODY" -g "$NOBODY" /dev/null "$SECRETS/$f"
  done
  if [ ! -s "$SECRETS/pg-monitor-password" ]; then
    command -v openssl >/dev/null 2>&1 || fail 1 "липсва openssl — паролата на ролята за мониторинг не се ражда."
    # само hex: влиза в SQL литерал (ensure_pg_role) без нужда от escape
    openssl rand -hex 32 >"$SECRETS/pg-monitor-password"
  fi
  for f in smtp-user smtp-password pg-monitor-password; do
    chown "$NOBODY:$NOBODY" "$SECRETS/$f"
    chmod 400 "$SECRETS/$f"
  done
}

# ── стекът ────────────────────────────────────────────────────────────────────────────────────────
enable_overlay() {
  compose_file_edit "$SHARED/.env" add "$OVERLAY"
  install -m 600 "$SHARED/.env" "$APP_DIR/.env"
}

pull_images() {
  local img
  for img in $(docker compose config --images); do
    case "$img" in *@sha256:*) ;; *) continue ;; esac
    docker image inspect "$img" >/dev/null 2>&1 && continue
    log "тегля $img…"
    docker pull -q "$img" >/dev/null || fail 1 "образът $img не се изтегли."
  done
}

# Ролята на postgres-exporter: LOGIN + pg_monitor, нищо повече. Паролата минава през stdin (не в
# аргументите на процес) и е hex. Всяко пускане я подравнява (след възстановяване на базата ролята я няма).
ensure_pg_role() {
  local pw
  docker compose up -d --no-build --no-recreate --wait db >/dev/null || fail 1 "базата не тръгна — първо deploy.sh."
  pw="$(tr -dc '0-9a-f' <"$SECRETS/pg-monitor-password")"
  [ "${#pw}" -ge 32 ] || fail 1 "$SECRETS/pg-monitor-password не е hex от openssl — изтрий го и пусни пак."
  printf '%s\n' \
    "SELECT 'CREATE ROLE chatchat_monitor' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatchat_monitor') \\gexec" \
    "ALTER ROLE chatchat_monitor WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 3 PASSWORD '$pw';" \
    "GRANT pg_monitor TO chatchat_monitor;" |
    docker compose exec -T db psql -X -q -v ON_ERROR_STOP=1 -U chatchat -d chatchat >/dev/null ||
    fail 1 "ролята chatchat_monitor не се създаде (docker compose logs db)."
}

start_stack() {
  log "up (стекът за мониторинг + приложението с включени метрики)…"
  docker compose up -d --no-build ||
    fail 1 "docker compose up се провали — образът на приложението има ли го? (първо deploy.sh)"
}

wait_ready() {
  local name="$1" port="$2" deadline=$((SECONDS + WAIT))
  until curl -fsS --max-time 5 "http://127.0.0.1:$port/-/ready" >/dev/null 2>&1; do
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep 3
  done
  ok "$name е готов на 127.0.0.1:$port"
}

# Числото от отговор на /api/v1/query с един скалар (vector с една серия) — без jq.
query_number() {
  { curl -fsS --max-time 5 -G "http://127.0.0.1:$1/api/v1/query" --data-urlencode "query=$2" 2>/dev/null |
    sed -n 's/.*"value":\[[^,]*,"\([0-9.]*\)"\].*/\1/p'; } || true
}

check_targets() {
  local port="$1" rules seen want deadline=$((SECONDS + WAIT)) down job
  rules="$(curl -fsS --max-time 5 "http://127.0.0.1:$port/api/v1/rules" 2>/dev/null | grep -o '"type":"alerting"' | wc -l | tr -d ' ')" || rules=0
  [ "${rules:-0}" -gt 0 ] || {
    warn "Prometheus не е заредил нито едно правило за аларма — docker compose logs prometheus"
    return 1
  }
  ok "заредени правила за аларми: $rules"
  want="$(printf '%s\n' $JOBS | wc -l | tr -d ' ')"
  # всяка цел — поне един скрейп (на 30 s)
  while :; do
    seen="$(query_number "$port" 'count(count by (job) (up))')"
    [ "${seen:-0}" -lt "$want" ] || break
    [ "$SECONDS" -lt "$deadline" ] || break
    sleep 5
  done
  down="$(curl -fsS --max-time 5 -G "http://127.0.0.1:$port/api/v1/query" --data-urlencode 'query=up == 0' 2>/dev/null |
    grep -o '"job":"[^"]*"' | sed 's/"job":"\(.*\)"/\1/' | sort -u | tr '\n' ' ')" || down=""
  for job in $JOBS; do
    [ -n "$(query_number "$port" "count(up{job=\"$job\"})")" ] || down="$down$job(няма) "
  done
  if [ -n "${down// /}" ]; then
    warn "цели, които не се четат: $down— runbook: ChatchatMonitoringTargetDown"
    return 1
  fi
  ok "Prometheus чете всички $want цели (up == 1)"
}

# ── проверката на одитната верига (дневно) ────────────────────────────────────────────────────────
# Файлът $1 става $2 с права $3 — само ако е различен. 0 при запис, 1 ако е същият, 2 при грешка.
put_file() {
  if [ -f "$2" ] && cmp -s "$1" "$2"; then return 1; fi
  install -m "$3" "$1" "$2" || return 2
}

install_audit_timer() {
  local src="$APP_DIR/deploy/monitoring" unit tmp rc changed=0
  if ! command -v systemctl >/dev/null 2>&1 || [ ! -d "$SYSTEMD_DIR" ]; then
    warn "няма systemd — дневната проверка на одитната верига не е сложена"
    return 1
  fi
  [[ "$SHARED" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
    warn "необичаен път $SHARED — таймерът не е сложен"
    return 1
  }
  rc=0 && put_file "$src/audit-verify.sh" "$SBIN/chatchat-audit-verify" 700 || rc=$?
  [ "$rc" != 2 ] || return 1
  for unit in chatchat-audit-verify.service chatchat-audit-verify.timer; do
    tmp="$(mktemp)" || return 1
    sed "s#/opt/few-few/shared/chatchat#$SHARED#g" "$src/systemd/$unit" >"$tmp"
    rc=0 && put_file "$tmp" "$SYSTEMD_DIR/$unit" 644 || rc=$?
    rm -f "$tmp"
    [ "$rc" != 2 ] || return 1
    [ "$rc" != 0 ] || changed=1
  done
  if [ "$changed" = 1 ]; then systemctl daemon-reload || return 1; fi
  systemctl enable --now chatchat-audit-verify.timer >/dev/null || return 1
  ok "одитната верига се проверява дневно (chatchat-audit-verify.timer, 04:07 UTC)"
}

# Резултат още няма (или е по-стар от 26 ч) → една проверка сега: алармата не чака до утре.
first_audit_verify() {
  if [ -n "$(find "$TEXTFILE" -maxdepth 1 -name chatchat_audit_chain.prom -mmin -1560 2>/dev/null)" ]; then
    return 0
  fi
  log "проверявам одитната верига сега…"
  if systemctl start chatchat-audit-verify.service; then
    ok "одитната верига е цяла (journalctl -u chatchat-audit-verify)"
  else
    warn "проверката на одитната верига не мина — journalctl -u chatchat-audit-verify -n 20 (runbook: ChatchatAuditChainBroken)"
    return 1
  fi
}

tunnel_hint() {
  log "графиките (от твоя компютър): ssh -N -L $1:127.0.0.1:$1 -L $2:127.0.0.1:$2 root@<сървъра>"
  log "  → http://127.0.0.1:$1 (Prometheus) · http://127.0.0.1:$2 (Alertmanager) — docs/runbook.md"
}

# ── команди ───────────────────────────────────────────────────────────────────────────────────────
cmd_enable() {
  local prom am rc=0
  preflight
  ensure_files
  check_settings
  cd "$APP_DIR"
  enable_overlay
  pull_images
  ensure_pg_role
  start_stack
  prom="$(port_of PROMETHEUS_PORT 4390)"
  am="$(port_of ALERTMANAGER_PORT 4393)"
  wait_ready Prometheus "$prom" || fail 1 "Prometheus не е готов след ${WAIT} s — docker compose logs prometheus"
  wait_ready Alertmanager "$am" || fail 1 "Alertmanager не е готов след ${WAIT} s — docker compose logs alertmanager (настройката на имейла?)"
  check_targets "$prom" || rc=1
  if install_audit_timer; then first_audit_verify || rc=1; else rc=1; fi
  tunnel_hint "$prom" "$am"
  [ "$rc" = 0 ] || warn "стекът тече, но има предупреждения (горе) — пробно писмо: bash $APP_DIR/deploy/monitoring.sh test-email"
  [ "$rc" = 0 ] && ok "мониторингът е включен — пробно писмо: sudo bash $APP_DIR/deploy/monitoring.sh test-email"
  return 0
}

cmd_status() {
  local prom am rc=0
  preflight
  overlay_enabled || fail 3 "мониторингът не е включен (няма $OVERLAY в COMPOSE_FILE) — sudo bash $APP_DIR/deploy/monitoring.sh"
  prom="$(port_of PROMETHEUS_PORT 4390)"
  am="$(port_of ALERTMANAGER_PORT 4393)"
  wait_ready Prometheus "$prom" || { warn "Prometheus не отговаря"; rc=1; }
  wait_ready Alertmanager "$am" || { warn "Alertmanager не отговаря"; rc=1; }
  [ "$rc" != 0 ] || check_targets "$prom" || rc=1
  return "$rc"
}

# Пробна аларма право в Alertmanager (severity ticket, изтича след 5 мин) → писмо по маршрута за тикети.
# Броячите на Alertmanager казват дали Brevo я е приел — без да се гадае по пощата.
cmd_test_email() {
  local am before after failed0 failed1 deadline ends
  preflight
  am="$(port_of ALERTMANAGER_PORT 4393)"
  wait_ready Alertmanager "$am" || fail 1 "Alertmanager не отговаря на 127.0.0.1:$am"
  # Опитите (заявките към SMTP), не известията: notifications_total расте още при опита, а провалът се
  # брои едва когато Alertmanager се откаже (проверено на живо, 0.34.1).
  before="$(am_counter "$am" alertmanager_notification_requests_total)"
  failed0="$(am_counter "$am" alertmanager_notification_requests_failed_total)"
  ends="$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%SZ)"
  curl -fsS --max-time 5 -X POST -H 'Content-Type: application/json' "http://127.0.0.1:$am/api/v2/alerts" \
    --data "[{\"labels\":{\"alertname\":\"ChatchatMonitoringTestEmail\",\"severity\":\"ticket\",\"component\":\"monitoring-test\"},\"annotations\":{\"summary\":\"Пробно писмо от deploy/monitoring.sh test-email — нищо не гори.\"},\"endsAt\":\"$ends\"}]" \
    >/dev/null || fail 1 "Alertmanager не прие пробната аларма."
  log "пробната аларма е подадена — чакам Alertmanager да я изпрати (групиране до ~1 мин)…"
  # групиране (1 мин) + един SMTP опит (недостъпен relay се отказва след ~2 мин)
  deadline=$((SECONDS + 300))
  while :; do
    after="$(am_counter "$am" alertmanager_notification_requests_total)"
    failed1="$(am_counter "$am" alertmanager_notification_requests_failed_total)"
    [ "$failed1" -gt "$failed0" ] && fail 1 "SMTP опитът се провали — docker compose logs alertmanager (SMTP login/ключ, подател, изход към порт 2525)."
    [ "$((after - failed1))" -gt "$((before - failed0))" ] && break
    [ "$SECONDS" -lt "$deadline" ] || fail 1 "писмото не тръгна за 300 s — docker compose logs alertmanager"
    sleep 5
  done
  ok "писмото е прието от Brevo — провери пощата на ALERT_EMAIL_TO (тема „[ChatChat][ticket][FIRING] ChatchatMonitoringTestEmail“)"
}

# Сумата на брояч за имейл интеграцията от /metrics на Alertmanager (цяло число).
am_counter() {
  { curl -fsS --max-time 5 "http://127.0.0.1:$1/metrics" 2>/dev/null || true; } |
    awk -v m="$2" '$1 ~ "^"m"\\{" && $1 ~ /integration="email"/ { s += $2 } END { printf "%d", s }'
}

cmd_disable() {
  preflight
  cd "$APP_DIR"
  compose_file_edit "$SHARED/.env" remove "$OVERLAY"
  install -m 600 "$SHARED/.env" "$APP_DIR/.env"
  log "спирам стека (приложението се пресъздава без принудените метрики — няколко секунди)…"
  docker compose up -d --no-build --remove-orphans || fail 1 "docker compose up се провали."
  ok "мониторингът е изключен; данните (томовете prometheus-data, alertmanager-data) и тайните остават."
  warn "дневната проверка на одитната верига остава (journalctl -u chatchat-audit-verify); алармите — не."
}

main() {
  case "${1:-enable}" in
    enable) cmd_enable ;;
    status) cmd_status ;;
    test-email) cmd_test_email ;;
    disable) cmd_disable ;;
    *) fail 1 "употреба: monitoring.sh [enable|status|test-email|disable]" ;;
  esac
}

# Изпълнен — прави; зареден със `source` (deploy.sh, тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
