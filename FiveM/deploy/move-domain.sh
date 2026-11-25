#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# move-domain.sh — премества сайта от стария адрес на новия. Еднократно и
# идемпотентно: второ пускане довършва прекъснатото и не прави нищо излишно.
#
#   sudo bash /opt/few-few/current/FiveM/deploy/move-domain.sh          # адресът
#   sudo bash /opt/few-few/current/FiveM/deploy/move-domain.sh --mail   # подателят
#
# Редът е нарочен: старият адрес става пренасочване ЧАК когато новият е доказано
# жив отвън с валиден сертификат. Падне ли нещо по пътя, сайтът остава достъпен
# на стария адрес и скриптът спира, преди да го е пипнал.
#
# `--mail` се пуска едва след като новият домейн е потвърден в Resend. Дотогава
# се сменя само показваното име: подател от непотвърден домейн Resend отказва, а
# уведомленията по чл. 16 и чл. 17 DSA са законово задължение.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

OLD="${OLD_DOMAIN:-fivembulgaria.carbonstealth.eu}"
NEW="${FIVEM_DOMAIN:-thraex.carbonstealth.eu}"
STATE="${FIVEM_STATE_DIR:-/opt/few-few/shared/fivem}"
APP="${FIVEM_APP_DIR:-/opt/few-few/current/FiveM}"
NGINX="${NGINX_DIR:-/etc/nginx}"
LE="${LETSENCRYPT_DIR:-/etc/letsencrypt}"
BACKUPS="${MOVE_BACKUP_DIR:-/root}"
# Пътят на дневниците не се сменя заедно с името: срокът от 14 дни в политиката
# виси на този път и на `/etc/logrotate.d/fivembulgaria`.
LOG_DIR="${FIVEM_NGINX_LOG_DIR:-/var/log/nginx/fivembulgaria}"
HEALTH="http://127.0.0.1:3010/api/health"
ENV_FILE="$STATE/.env"
OLD_SITE="$NGINX/sites-available/fivembulgaria"
NEW_SITE="$NGINX/sites-available/thraex"
STAMP="$(date +%Y%m%d-%H%M%S)"

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Пусни го със sudo."
[ -f "$ENV_FILE" ] || die "Няма $ENV_FILE. Първо направи деплой на fivem."
[ -f "$APP/deploy/nginx.conf" ] || die "Няма $APP/deploy/nginx.conf. Първо направи деплой на fivem."

if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else die "Липсва Docker Compose."; fi

# Пази оригинала само веднъж: второ пускане не бива да запише вече смененото.
back_up_env() {
  [ -f "$ENV_FILE.pre-move" ] || install -m 600 "$ENV_FILE" "$ENV_FILE.pre-move"
}

put_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i -E "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
}

# `restart` НЕ чете наново `env_file`: контейнерът би останал със стария адрес.
recreate() {
  log "Пресъздавам web и cron с новата среда…"
  ( cd "$APP" && $DC up -d --force-recreate web cron )
  for _ in $(seq 1 45); do
    curl -fsS -m 3 "$HEALTH" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

if [ "${1:-}" = "--mail" ]; then
  back_up_env
  put_env EMAIL_FROM "Thraex PVP <no-reply@$NEW>"
  recreate || die "Приложението не се вдигна. Върни средата: cp $ENV_FILE.pre-move $ENV_FILE"
  ok "Подателят е no-reply@$NEW. Изпрати си пробен сигнал от формата и виж дали пристига."
  exit 0
fi

# ── 1) DNS: преди certbot, защото Let's Encrypt брои неуспешните опити ───────
first_ip() { getent ahostsv4 "$1" 2>/dev/null | awk 'NR==1 { print $1 }'; }
# Собствените адреси на машината: на VPS публичният е на интерфейса. Старият
# запис не е мярка, защото може вече да е изтрит. `SERVER_IP` е за машина зад NAT.
own_ips() { { hostname -I 2>/dev/null || true; printf ' %s' "${SERVER_IP:-}"; } | tr ' ' '\n' | grep -v '^$' || true; }
HERE="$(first_ip "$OLD" || true)"
THERE="$(first_ip "$NEW" || true)"
[ -n "$THERE" ] || die "$NEW още няма DNS запис. Добави A запис към IP-то на сървъра и пусни пак."
if own_ips | grep -qxF "$THERE" || [ "$THERE" = "$HERE" ]; then
  ok "DNS: $NEW → $THERE"
else
  die "$NEW сочи към $THERE, а тази машина е на: $(own_ips | tr '\n' ' '). Поправи A записа и пусни пак."
fi
# Без стария запис старите връзки не водят никъде и сертификатът му не се подновява.
[ -n "$HERE" ] || warn "$OLD няма DNS запис. Върни A записа към $THERE: без него пренасочването не стига до никого."

# ── 2) Новият сайт-блок. Живият файл не се презаписва: certbot дописва в него ─
[ -d "$LOG_DIR" ] || die "Няма $LOG_DIR: nginx няма да тръгне. Първо направи деплой на fivem."
if [ ! -f "$NEW_SITE" ]; then
  log "Създавам сайт-блока за $NEW…"
  sed -E "s/^( *server_name ).*/\1$NEW;/" "$APP/deploy/nginx.conf" > "$NEW_SITE"
  chmod 644 "$NEW_SITE"
  ln -sfn "$NEW_SITE" "$NGINX/sites-enabled/thraex"
  if ! nginx -t; then
    rm -f "$NGINX/sites-enabled/thraex" "$NEW_SITE"
    die "nginx -t не мина. Махнах новия блок, старият адрес работи както досега."
  fi
  systemctl reload nginx
fi

# ── 3) Сертификатът ───────────────────────────────────────────────────────────
if ! grep -q "live/$NEW/fullchain.pem" "$NEW_SITE"; then
  curl -fsS -m 15 "http://$NEW/api/health" >/dev/null \
    || die "http://$NEW не отговаря отвън. Не пускам certbot напразно."
  log "Издавам сертификат за $NEW…"
  # На машината може да има няколко сметки в Let's Encrypt: без избор certbot пита
  # и в неинтерактивен режим пада. Взима се сметката на стария адрес, иначе на
  # последно подновения сертификат.
  conf="$LE/renewal/$OLD.conf"
  [ -f "$conf" ] || conf="$(ls -t "$LE"/renewal/*.conf 2>/dev/null | head -n 1 || true)"
  account=""
  if [ -n "$conf" ] && [ -f "$conf" ]; then
    account="$(awk -F' *= *' '$1 == "account" { print $2; exit }' "$conf" || true)"
  fi
  issue=(--nginx -d "$NEW" --non-interactive --redirect --keep-until-expiring)
  if [ -n "$account" ]; then
    issue+=(--account "$account")
    log "Сметка в Let's Encrypt: $account (от $(basename "$conf"))"
  fi
  certbot "${issue[@]}"
fi
curl -fsS -m 15 "https://$NEW/api/health" >/dev/null \
  || die "https://$NEW не отговаря. Старият адрес работи както досега."
ok "https://$NEW отговаря."

# ── 4) Средата на приложението ────────────────────────────────────────────────
before="$(cksum < "$ENV_FILE")"
back_up_env
put_env PUBLIC_BASE_URL "https://$NEW"
# Само показваното име, виж началото на файла.
sed -i -E 's|^EMAIL_FROM=[^<]*<|EMAIL_FROM=Thraex PVP <|' "$ENV_FILE"
chmod 600 "$ENV_FILE"
if [ "$before" != "$(cksum < "$ENV_FILE")" ]; then
  recreate || die "Приложението не се вдигна. Върни средата: cp $ENV_FILE.pre-move $ENV_FILE и пусни $DC up -d --force-recreate web cron в $APP"
fi
curl -fsS -m 20 "https://$NEW/bg" | grep -q "https://$NEW/bg" \
  || die "Страниците още не сочат към $NEW. Провери PUBLIC_BASE_URL в $ENV_FILE. Старият адрес работи както досега."
ok "Каноничните адреси сочат към $NEW."

# ── 5) Старият адрес става само пренасочване ─────────────────────────────────
[ -f "$OLD_SITE" ] || die "Няма $OLD_SITE."
if grep -q "return 301 https://$NEW" "$OLD_SITE"; then
  ok "$OLD вече пренасочва."
else
  # Сертификатът остава: браузър с HSTS за стария адрес не приема нищо друго.
  [ -f "$LE/live/$OLD/fullchain.pem" ] || die "Няма сертификат за $OLD, а без него https пренасочването не работи."
  saved="$BACKUPS/fivembulgaria.nginx.bak-$STAMP"
  cp -a "$OLD_SITE" "$saved"
  ssl_extra=""
  [ -f "$LE/options-ssl-nginx.conf" ] && ssl_extra+="  include $LE/options-ssl-nginx.conf;"$'\n'
  [ -f "$LE/ssl-dhparams.pem" ] && ssl_extra+="  ssl_dhparam $LE/ssl-dhparams.pem;"$'\n'
  # На порт 80 пренасочването е в `location`, не на ниво server: иначе минава
  # пред проверката на Let's Encrypt и сертификатът спира да се подновява.
  cat > "$OLD_SITE" <<NGINX_CONF
# Старият адрес: само постоянно пренасочване към новия, със същия път.
# Създаден от FiveM/deploy/move-domain.sh. Оригиналът: $saved
server {
  listen 80;
  listen [::]:80;
  server_name $OLD;
  server_tokens off;
  access_log off;
  error_log $LOG_DIR/error.log;
  location / {
    return 301 https://$NEW\$request_uri;
  }
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name $OLD;
  server_tokens off;
  access_log off;
  error_log $LOG_DIR/error.log;
  ssl_certificate $LE/live/$OLD/fullchain.pem;
  ssl_certificate_key $LE/live/$OLD/privkey.pem;
${ssl_extra}  return 301 https://$NEW\$request_uri;
}
NGINX_CONF
  if ! nginx -t; then
    cp -a "$saved" "$OLD_SITE"
    die "nginx -t не мина. Върнах стария блок, $OLD работи както досега."
  fi
  systemctl reload nginx
  ok "$OLD пренасочва към $NEW. Оригиналът е в $saved."
fi

answer="$(curl -sS -m 15 -o /dev/null -w '%{http_code} %{redirect_url}' "https://$OLD/bg/rules" || true)"
if [ "$answer" = "301 https://$NEW/bg/rules" ]; then
  ok "Проверено отвън: $answer"
else
  warn "Очаквах пренасочване към https://$NEW/bg/rules, получих: ${answer:-нищо}"
fi

# ── 6) Търсачките ─────────────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1 \
  && node "$(dirname "$APP")/tools/seo/indexnow.mjs" "https://$NEW" --key-file "$APP/public/indexnow-key.txt" >/dev/null 2>&1; then
  ok "IndexNow е уведомен за новия адрес."
else
  warn "IndexNow не мина. Не е спешно: следващият деплой го пуска пак."
fi

ok "Готово: сайтът е на https://$NEW"
log "Останали ръчни стъпки: Search Console (нов ресурс и „Промяна на адреса“) и потвърждение на $NEW в Resend, после --mail."
