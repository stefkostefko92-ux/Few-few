#!/bin/bash
# cert-watch — ежедневно самолечение на TLS сертификатите от certbot (Let's Encrypt).
#
# Защо съществува (12.10.2026): сертификатът на vizitka-bg.com ИЗТЕЧЕ на 10.10 и сайтът
# падна, макар certbot.timer да подновяваше другите сертификати на същата машина.
# Две отделни дупки, всяка достатъчна сама:
#   1. сертификатът беше взет с `--webroot`, а nginx блокът на порт 80 пренасочваше
#      ВСИЧКО към https — включително /.well-known/acme-challenge/ → Let's Encrypt не
#      намираше файла и подновяването тихо падаше (certbot.timer не крещи);
#   2. `certonly --webroot` НЕ презарежда nginx — дори успешно подновен сертификат
#      остава незабелязан, докато nginx държи стария в паметта.
#
# Какво прави за всеки сертификат в /etc/letsencrypt/live:
#   • изтича до RENEW_DAYS дни → `certbot renew` за него; падне ли (както при
#     webroot зад пренасочване) → повторен опит с nginx плъгина, който сам вкарва
#     ACME пътя и работи независимо от пренасочванията (и запомня новия метод);
#   • файлът на диска е по-нов от работещия nginx → `systemctl reload nginx`;
#   • остане ли сертификат под ALARM_DAYS дни → изход 1: systemd маркира услугата
#     като failed — вижда се в `systemctl --failed`, journalctl и VPS таблото.
#
# Идемпотентно и безопасно за пускане по всяко време: certbot сам отказва да подновява
# сертификат, който още не е близо до изтичане.
# deploy-check: allow-no-errexit — провал при ЕДИН сертификат не бива да спира проверката на останалите; грешките се събират в alarm и изходът е 1.
set -uo pipefail

LIVE_DIR="${LIVE_DIR:-/etc/letsencrypt/live}"
RENEW_DAYS="${RENEW_DAYS:-30}"
ALARM_DAYS="${ALARM_DAYS:-7}"
NGINX_PID="${NGINX_PID:-/run/nginx.pid}"

log() { echo "cert-watch: $*"; }

days_left() {
  local end
  end="$(openssl x509 -noout -enddate -in "$1" 2>/dev/null | cut -d= -f2)" || return 1
  [ -n "$end" ] || return 1
  echo $(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
}

reload_nginx() {
  command -v nginx >/dev/null || return 0
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx && log "nginx презареден"
  else
    log "ВНИМАНИЕ: nginx -t се проваля — НЕ презареждам (провери конфигурацията)"
    return 1
  fi
}

[ -d "$LIVE_DIR" ] || { log "няма $LIVE_DIR — нищо за правене"; exit 0; }
command -v certbot >/dev/null || { log "certbot липсва"; exit 1; }

renewed=0
alarm=0
shopt -s nullglob
for dir in "$LIVE_DIR"/*/; do
  name="$(basename "$dir")"
  cert="$dir/fullchain.pem"
  [ -f "$cert" ] || continue
  left="$(days_left "$cert")" || { log "$name: не мога да прочета сертификата"; alarm=1; continue; }

  if [ "$left" -le "$RENEW_DAYS" ]; then
    log "$name: остават $left дни — подновявам"
    if certbot renew --cert-name "$name" --non-interactive --quiet; then
      renewed=1
    elif command -v nginx >/dev/null && certbot plugins 2>/dev/null | grep -q '^\* nginx'; then
      log "$name: обичайното подновяване падна — опитвам с nginx плъгина"
      if certbot renew --cert-name "$name" --non-interactive --quiet \
        --authenticator nginx --installer null --force-renewal; then
        renewed=1
        log "$name: подновен с nginx плъгина (методът е запомнен за следващите пъти)"
      else
        log "$name: и nginx плъгинът падна — виж /var/log/letsencrypt/letsencrypt.log"
      fi
    else
      log "$name: подновяването падна, а nginx плъгин няма (apt-get install python3-certbot-nginx)"
    fi
    left="$(days_left "$cert")" || left=0
  fi

  if [ "$left" -le "$ALARM_DAYS" ]; then
    log "ТРЕВОГА: $name изтича след $left дни"
    alarm=1
  fi
done

# Подновен на диска, но nginx още сервира стария от паметта? (Липсващ deploy hook,
# ръчно подновяване, подновяване от друг инструмент.) Сравняваме с момента, в който
# nginx последно е зареждал конфигурацията — pid файлът се пише при старт.
stale=0
if [ -f "$NGINX_PID" ]; then
  for cert in "$LIVE_DIR"/*/fullchain.pem; do
    [ "$(readlink -f "$cert")" -nt "$NGINX_PID" ] && stale=1
  done
fi
if [ "$renewed" = 1 ] || [ "$stale" = 1 ]; then
  reload_nginx || alarm=1
  [ -f "$NGINX_PID" ] && touch "$NGINX_PID"   # отбелязва „заредено“ за следващата проверка
fi

[ "$alarm" = 0 ] && log "всички сертификати са наред" || exit 1
