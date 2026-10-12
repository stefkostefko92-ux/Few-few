#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy/provision/chatchat-host.sh — възпроизводимо подготвяне на сървър за ChatChat (IaC): нов
# Hetzner/Ubuntu 24.04+ хост става готов за `PROJECTS="chatchat"` / `"chatchat-staging"` без ръчни стъпки
# по памет. Идемпотентен: всяка стъпка първо гледа състоянието и пипа само разликата.
#
#   sudo bash deploy/provision/chatchat-host.sh            # прилага
#   sudo bash deploy/provision/chatchat-host.sh --check    # САМО докладва какво би сменил (нищо не пипа);
#                                                          # изход 2 = има разлики, 0 = всичко е на място
#   sudo bash deploy/provision/chatchat-host.sh --dns      # A/AAAA на домейните срещу адресите на машината
#
# Какво: пакетите (Docker Engine + compose plugin от официалното apt репо на Docker, nginx, certbot,
# cryptsetup, ufw, fail2ban, unattended-upgrades, age, chrony при нужда) → firewall (само
# 22/80/443 навътре) → автоматичните кръпки → часовникът (TOTP иска точно време) → папките и правата под
# /opt/few-few/shared/chatchat{,-staging} → достъпът на staging в nginx → таймерите за бекъп и ретенция
# (unit-ите от chatchat/deploy/systemd/) → logrotate.
#
# Какво НЕ прави (нарочно): не пипа конфигурации на другите продукти (vhost-ове, daemon.json, чужди
# правила на ufw — само ги докладва), не обновява и не рестартира съществуващ Docker (би спрял всички
# контейнери на машината), не слага nginx, ако 80/443 вече държи друг (Caddy), не включва шифрования том
# на базата (chatchat/deploy/pgdata-encrypt.sh — иска решение за носителя) и не измисля тайни на
# продукцията (DEPLOY.md, т. 1). TLS: certbot след DNS (`--dns`, DEPLOY.md, „DNS“).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 022

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CC_DEPLOY="$REPO/chatchat/deploy"
FEW_FEW="${FEW_FEW_ROOT:-/opt/few-few}"
ETC="${PROVISION_ETC:-/etc}"
SYSTEMD_DIR="${CHATCHAT_SYSTEMD_DIR:-$ETC/systemd/system}"
SBIN="${CHATCHAT_SBIN:-/usr/local/sbin}"
LOG_DIR="${CHATCHAT_LOG_DIR:-/var/log/chatchat}"
SHARED="$FEW_FEW/shared/chatchat"
STAGING="$FEW_FEW/shared/chatchat-staging"
ACCESS_DIR="$ETC/nginx/chatchat-staging"
DOMAINS="${CHATCHAT_DOMAINS:-chatchat.carbonstealth.eu staging-chatchat.carbonstealth.eu}"
DOCKER_MIN="29.5.1"
# Официалният ключ на apt репото на Docker (docs.docker.com/engine/install/ubuntu; проверено на живо
# 10.10.2026 с `gpg --show-keys`). Друг отпечатък → отказ.
DOCKER_FPR="9DC858229FC7DD38854AE2D88D81803C0EBFCD88"
PKGS="nginx certbot python3-certbot-nginx cryptsetup ufw fail2ban unattended-upgrades age curl ca-certificates gnupg logrotate"
UNITS="chatchat-backup.service chatchat-backup.timer chatchat-retention.service chatchat-retention.timer"

MODE=apply
CHANGES=0
WARNINGS=0

say() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
good() { printf '\033[32m✔ %s\033[0m\n' "$*"; }
note() {
  WARNINGS=$((WARNINGS + 1))
  printf '\033[33m⚠ %s\033[0m\n' "$*" >&2
}
die() {
  printf '\033[31m✘ %s\033[0m\n' "$*" >&2
  exit 1
}

# Една промяна: в --check само се казва; иначе се прави. Провал на промяна спира скрипта (set -e).
change() {
  local what="$1"
  shift
  CHANGES=$((CHANGES + 1))
  if [ "$MODE" = check ]; then
    printf '\033[35m~ би сменил: %s\033[0m\n' "$what"
    return 0
  fi
  say "$what"
  # Изрично, не през set -e: change() се вика и от условия (`if put_file …`), където errexit не важи.
  "$@" || die "не стана: $what"
}

pkg_installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'; }
listening() { command -v ss >/dev/null 2>&1 && [ -n "$(ss -Hltn "sport = :$1" 2>/dev/null | head -n 1)" ]; }

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get update -q
  # shellcheck disable=SC2048,SC2086 # списъкът е от думи без интервали (имена на пакети)
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends $*
}

# ── 1) Пакетите ──────────────────────────────────────────────────────────────
step_packages() {
  local p missing=""
  for p in $PKGS; do
    pkg_installed "$p" && continue
    # nginx при зает 80/443 (Caddy на adblock): postinst-ът му би паднал — не го слагаме, казваме го.
    if [ "$p" = nginx ] && { listening 80 || listening 443; }; then
      note "nginx липсва, а 80/443 държи друга услуга — не го слагам (ChatChat иска nginx на хоста; DEPLOY.md, т. 2)."
      continue
    fi
    missing="$missing $p"
  done
  if [ -n "$missing" ]; then
    change "apt-get install$missing" apt_install "$missing"
  else
    good "пакетите са на място"
  fi
}

# ── 2) Docker Engine + compose plugin (официалното репо; съществуващ НЕ се пипа) ───────────────────
docker_repo() {
  local codename key tmp fpr
  # shellcheck disable=SC1091 # системният файл на дистрибуцията
  codename="$(. "$ETC/os-release" 2>/dev/null && printf '%s' "${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}")" || codename=""
  [ -n "$codename" ] || die "не познах версията на Ubuntu ($ETC/os-release) — Docker се слага ръчно (docs.docker.com/engine/install/ubuntu)."
  install -d -m 755 "$ETC/apt/keyrings"
  key="$ETC/apt/keyrings/docker.asc"
  tmp="$(mktemp)"
  curl -fsSL --retry 3 https://download.docker.com/linux/ubuntu/gpg -o "$tmp" || {
    rm -f "$tmp"
    die "ключът на apt репото на Docker не се изтегли."
  }
  fpr="$(gpg --show-keys --with-colons "$tmp" 2>/dev/null | awk -F: '$1=="fpr"{print $10; exit}')" || fpr=""
  if [ "$fpr" != "$DOCKER_FPR" ]; then
    rm -f "$tmp"
    die "ключът на Docker е с непознат отпечатък (${fpr:-няма}) — отказ (очакван $DOCKER_FPR)."
  fi
  install -m 644 "$tmp" "$key"
  rm -f "$tmp"
  install -d -m 755 "$ETC/apt/sources.list.d"
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nSigned-By: %s\n' \
    "$codename" "/etc/apt/keyrings/docker.asc" >"$ETC/apt/sources.list.d/docker.sources"
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

step_docker() {
  local v
  if ! command -v docker >/dev/null 2>&1; then
    change "Docker Engine + compose plugin от download.docker.com (ключ $DOCKER_FPR)" docker_repo
    return 0
  fi
  v="$(docker version --format '{{.Server.Version}}' 2>/dev/null)" || v=""
  if [ -z "$v" ]; then
    note "docker го има, но демонът не отговаря — systemctl status docker (не го пипам)."
  elif [ "$(printf '%s\n%s\n' "$DOCKER_MIN" "$v" | sort -V | head -n 1)" != "$DOCKER_MIN" ]; then
    note "Docker Engine $v < $DOCKER_MIN (docker cp CVE-2026-41567/41568/42306) — обнови в прозорец за поддръжка: ВСИЧКИ контейнери на машината се рестартират."
  else
    good "Docker Engine $v"
  fi
  docker compose version >/dev/null 2>&1 || note "липсва docker compose plugin — apt-get install docker-compose-plugin"
}

# ── 3) Firewall: навътре само 22/80/443 (чужди правила — само се докладват) ──────────────────────────
ufw_default_deny() { ufw default deny incoming >/dev/null; }
ufw_allow() { ufw allow "$1" >/dev/null; }
ufw_enable() { ufw --force enable >/dev/null; }

step_firewall() {
  local ports p added extra before="$CHANGES"
  command -v ufw >/dev/null 2>&1 || {
    [ "$MODE" = check ] || note "няма ufw — firewall-ът не е настроен"
    return 0
  }
  # SSH на друг порт + „само 22“ = заключена машина. Тогава не включваме нищо — решава човек.
  ports="$(sshd -T 2>/dev/null | awk '$1=="port"{print $2}' | sort -u | tr '\n' ' ')" || ports=""
  if [ -n "$ports" ] && [ "${ports% }" != 22 ]; then
    note "sshd слуша на: ${ports% } (не само 22) — firewall-ът не е пипан, за да не заключа машината."
    return 0
  fi
  added="$(ufw show added 2>/dev/null)" || added=""
  for p in 22/tcp 80/tcp 443/tcp; do
    printf '%s\n' "$added" | grep -qxE "ufw allow $p( comment .*)?" || change "ufw allow $p" ufw_allow "$p"
  done
  grep -qx 'DEFAULT_INPUT_POLICY="DROP"' "$ETC/default/ufw" 2>/dev/null ||
    change "ufw default deny incoming" ufw_default_deny
  ufw status 2>/dev/null | grep -qx 'Status: active' || change "ufw --force enable" ufw_enable
  extra="$(printf '%s\n' "$added" | grep -E '^ufw (allow|limit)' | grep -vxE 'ufw allow (22|80|443)/tcp( comment .*)?' || true)"
  [ -z "$extra" ] || note "ufw допуска и други правила (не ги пипам — може да са на друг продукт): $(printf '%s' "$extra" | tr '\n' ';')"
  [ "$CHANGES" -gt "$before" ] || good "ufw: 22/80/443, всичко друго навътре — отказ"
}

# ── 4) fail2ban + автоматичните кръпки ──────────────────────────────────────────────────────────────
enable_now() { systemctl enable --now "$@" >/dev/null; }

step_services() {
  local unit
  for unit in fail2ban apt-daily-upgrade.timer; do
    if systemctl is-enabled "$unit" >/dev/null 2>&1 && systemctl is-active "$unit" >/dev/null 2>&1; then
      continue
    fi
    change "systemctl enable --now $unit" enable_now "$unit"
  done
  [ -f "$ETC/fail2ban/jail.d/defaults-debian.conf" ] || [ -f "$ETC/fail2ban/jail.local" ] ||
    [ "$MODE" = check ] || note "fail2ban без sshd jail (jail.d/defaults-debian.conf/jail.local) — провери: fail2ban-client status sshd"
  local auto="$ETC/apt/apt.conf.d/20auto-upgrades"
  if [ ! -f "$auto" ]; then
    change "автоматичните кръпки: $auto" write_auto_upgrades "$auto"
  elif ! grep -q 'APT::Periodic::Unattended-Upgrade "1"' "$auto"; then
    note "$auto изключва автоматичните кръпки — решение на собственика, не го пипам."
  fi
}

write_auto_upgrades() {
  install -d -m 755 "$(dirname "$1")"
  printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' >"$1"
}

# ── 5) Часовникът: TOTP (MFA) и подписаните адреси искат точно време ───────────────────────────────
chrony_install() {
  apt_install chrony
  systemctl enable --now chrony
}

step_clock() {
  if systemctl is-active chrony >/dev/null 2>&1; then
    if chronyc -n tracking 2>/dev/null | grep -qE '^Leap status +: Normal'; then
      good "часовникът: chrony, синхронизиран"
    else
      note "chrony тече, но не е синхронизиран — chronyc -n sources (изходящ UDP 123?)"
    fi
  elif [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = yes ]; then
    good "часовникът: синхронизиран (systemd-timesyncd) — не го сменям"
  else
    change "chrony (часовникът не е синхронизиран)" chrony_install
  fi
}

# ── 6) Папките и правата (само chatchat*) ───────────────────────────────────────────────────────────
# $1 път · $2 mode · $3 uid · $4 gid. Липсва → създава; друг mode/собственик → поправя (папките са наши).
ensure_dir() {
  local cur
  if [ ! -d "$1" ]; then
    change "папка $1 ($2, $3:$4)" install -d -m "$2" -o "$3" -g "$4" "$1"
    return 0
  fi
  cur="$(stat -c '%a %u %g' "$1")"
  [ "$cur" = "$2 $3 $4" ] || change "права на $1: $cur → $2 $3 $4" fix_dir "$1" "$2" "$3" "$4"
}
fix_dir() {
  chown "$3:$4" "$1"
  chmod "$2" "$1"
}
# Чужд корен (/opt/few-few, …/shared) само се създава, ако липсва — съществуващ не се пипа.
ensure_root_dir() {
  [ -d "$1" ] || change "папка $1 (755)" install -d -m 755 "$1"
}

step_dirs() {
  local www=0 env
  getent group www-data >/dev/null 2>&1 && www="$(getent group www-data | cut -d: -f3)"
  ensure_root_dir "$FEW_FEW"
  ensure_root_dir "$FEW_FEW/releases"
  ensure_root_dir "$FEW_FEW/shared"
  for env in "$SHARED" "$STAGING"; do
    ensure_dir "$env" 700 0 0
    ensure_dir "$env/attachments" 700 1000 1000
    ensure_dir "$env/eval-reports" 755 0 0
    ensure_dir "$env/backups" 700 0 0
  done
  ensure_dir "$SHARED/backups/daily" 700 0 0
  ensure_dir "$STAGING/releases" 700 0 0
  ensure_dir "$STAGING/eval-runs" 700 0 0
  ensure_dir "$LOG_DIR" 750 0 0
  # Достъпът до staging (vhost-ът го включва — без allow.conf `nginx -t` пада за цялата машина).
  ensure_dir "$ACCESS_DIR" 750 0 "$www"
  [ -f "$ACCESS_DIR/allow.conf" ] || change "$ACCESS_DIR/allow.conf (празен = само с парола)" write_allow "$www"
  [ -s "$ACCESS_DIR/htpasswd" ] || [ "$MODE" = check ] ||
    note "staging е затворен, докато няма $ACCESS_DIR/htpasswd (chatchat/DEPLOY.md, „Staging“)"
}
write_allow() {
  printf '%s\n' '# Адресите с достъп до staging без парола: `allow <IP>;` на ред (chatchat/DEPLOY.md, „Staging“).' \
    '# Празно = само с парола (htpasswd до този файл).' >"$ACCESS_DIR/allow.conf"
  chown "0:$1" "$ACCESS_DIR/allow.conf"
  chmod 640 "$ACCESS_DIR/allow.conf"
}

# ── 7) Таймерите (бекъп, ретенция) — същите файлове като chatchat/deploy/timers-install.sh ──────────
# $1 източник · $2 цел · $3 mode. Променя само при разлика.
put_file() {
  if [ -f "$2" ] && cmp -s "$1" "$2"; then return 1; fi
  change "$2" install -D -m "$3" "$1" "$2"
}

step_timers() {
  local unit tmp changed=0 pair
  [ -d "$CC_DEPLOY/systemd" ] || die "няма $CC_DEPLOY/systemd — пусни скрипта от цялото репо/архив."
  for pair in backup.sh:chatchat-backup retention.sh:chatchat-retention; do
    put_file "$CC_DEPLOY/${pair%%:*}" "$SBIN/${pair#*:}" 700 || true
  done
  for unit in $UNITS; do
    tmp="$(mktemp)"
    sed "s#/opt/few-few/shared/chatchat#$SHARED#g" "$CC_DEPLOY/systemd/$unit" >"$tmp"
    if put_file "$tmp" "$SYSTEMD_DIR/$unit" 644; then changed=1; fi
    rm -f "$tmp"
  done
  [ "$changed" = 0 ] || change "systemctl daemon-reload" systemctl daemon-reload
  for unit in chatchat-backup.timer chatchat-retention.timer; do
    if [ "$changed" = 0 ] && systemctl is-enabled "$unit" >/dev/null 2>&1 && systemctl is-active "$unit" >/dev/null 2>&1; then
      continue
    fi
    change "systemctl enable --now $unit" enable_now "$unit"
  done
  [ -s "$SHARED/backup-recipients.txt" ] || [ "$MODE" = check ] ||
    note "бекъпът няма получател — публичният age ключ на собственика в $SHARED/backup-recipients.txt (DEPLOY.md, т. 9)"
}

# ── 8) logrotate ─────────────────────────────────────────────────────────────────────────────────────
step_logrotate() {
  if put_file "$CC_DEPLOY/logrotate/chatchat" "$ETC/logrotate.d/chatchat" 644 && [ "$MODE" = apply ] &&
    command -v logrotate >/dev/null 2>&1; then
    logrotate --debug "$ETC/logrotate.d/chatchat" >/dev/null 2>&1 || die "logrotate отказа $ETC/logrotate.d/chatchat"
  fi
}

# ── --dns: записите преди certbot (DEPLOY.md, „DNS“) ────────────────────────────────────────────────
# Адресите на машината: SERVER_IPV4/SERVER_IPV6 (зад NAT/floating IP), иначе глобалните на интерфейсите.
dns_check() {
  local mine d a bad=0 fam got
  mine="${SERVER_IPV4:-} ${SERVER_IPV6:-}"
  if [ -z "${mine// /}" ]; then
    mine="$(ip -o addr show scope global 2>/dev/null | awk '{split($4, a, "/"); print a[1]}' | tr '\n' ' ')" || mine=""
  fi
  say "адресите на машината: ${mine:-(не ги намирам — задай SERVER_IPV4/SERVER_IPV6)}"
  for d in $DOMAINS; do
    for fam in 4 6; do
      got="$(getent "ahostsv$fam" "$d" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')" || got=""
      if [ "$fam" = 6 ]; then got="$(printf '%s' "$got" | tr ' ' '\n' | grep ':' | tr '\n' ' ' || true)"; fi
      if [ "$fam" = 4 ]; then got="$(printf '%s' "$got" | tr ' ' '\n' | grep -v ':' | tr '\n' ' ' || true)"; fi
      if [ -z "${got// /}" ]; then
        if [ "$fam" = 4 ]; then
          note "$d: НЯМА A запис — certbot ще падне (DEPLOY.md, „DNS“)"
          bad=1
        else
          say "$d: няма AAAA (по избор; ако машината има IPv6 — добави го)"
        fi
        continue
      fi
      for a in $got; do
        case " $mine " in
          *" $a "*) good "$d → $a (тази машина)" ;;
          *)
            note "$d → $a — НЕ е адрес на тази машина"
            bad=1
            ;;
        esac
      done
    done
  done
  return "$bad"
}

main() {
  case "${1:-}" in
    --check) MODE=check ;;
    --dns)
      dns_check
      return
      ;;
    '') ;;
    -h | --help)
      sed -n '2,24p' "${BASH_SOURCE[0]}"
      return 0
      ;;
    *) die "непознат аргумент: $1 (--check | --dns)" ;;
  esac
  [ "$(id -u)" = 0 ] || die "пусни като root (sudo)."
  command -v apt-get >/dev/null 2>&1 || die "очаквам Ubuntu/Debian с apt-get."
  [ "$MODE" = check ] && say "режим --check: нищо не се променя"
  step_packages
  step_docker
  step_firewall
  step_services
  step_clock
  step_dirs
  step_timers
  step_logrotate
  if [ "$MODE" = check ]; then
    if [ "$CHANGES" -gt 0 ]; then
      say "би сменил $CHANGES неща (предупреждения: $WARNINGS) — пусни без --check"
      return 2
    fi
    good "всичко е на място (предупреждения: $WARNINGS)"
    return 0
  fi
  good "готово: $CHANGES промени, $WARNINGS предупреждения. Следва: DNS (--dns) → certbot → деплой (chatchat/DEPLOY.md)."
}

# Изпълнен — прилага/проверява; зареден със `source` (тестовете) — само дефинира функциите. main е
# последната команда (не в `||`/`if`): иначе bash изключва set -e за ВСИЧКО вътре в нея.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
