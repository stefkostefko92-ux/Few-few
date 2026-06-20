#!/usr/bin/env bash
#
# init-letsencrypt.sh — издаване на безплатен Let's Encrypt сертификат
# за zabobovdol чрез certbot (webroot метод), който пасва на готовия
# nginx блок за certbot (location /.well-known/acme-challenge/ -> /var/www/certbot).
#
# Този скрипт НИЩО НЕ ТРИЕ и НИЩО НЕ ПРЕЗАПИСВА в конфигурациите.
# Той само:
#   1) проверява, че домейнът сочи към този сървър (DNS A-запис);
#   2) пуска временен certbot контейнер, който решава ACME предизвикателството
#      през вече работещия nginx (порт 80, webroot /var/www/certbot);
#   3) копира издадените сертификати в ./nginx/certs/, откъдето 443 блокът ги чете.
#
# СЛЕД успешно издаване операторът РЪЧНО разкоментира HTTPS (виж края на скрипта).
#
# Употреба (на VPS-а, в папката на проекта, докато docker compose е вдигнат):
#   ./scripts/init-letsencrypt.sh
#   DOMAIN=zabobovdol.carbonstealth.eu EMAIL=admin@carbonstealth.eu ./scripts/init-letsencrypt.sh
#   STAGING=1 ./scripts/init-letsencrypt.sh   # тест без да хабиш лимита на Let's Encrypt
#
set -euo pipefail

# --- Локации ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- Настройки (с разумни стойности по подразбиране) ---
DOMAIN="${DOMAIN:-zabobovdol.carbonstealth.eu}"
EMAIL="${EMAIL:-admin@carbonstealth.eu}"
STAGING="${STAGING:-0}"                 # STAGING=1 → тестов (staging) сертификат
COMPOSE="${COMPOSE_CMD:-docker compose}"

# Папки за webroot (ACME предизвикателство) и за издадените сертификати.
# WEBROOT трябва да съвпада с nginx: root /var/www/certbot;
WEBROOT_DIR="$ROOT_DIR/nginx/certbot"   # монтира се в nginx като /var/www/certbot
CERTS_DIR="$ROOT_DIR/nginx/certs"       # тук 443 блокът чака fullchain.pem / privkey.pem

log()  { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { printf '\n[ГРЕШКА] %s\n' "$*" >&2; exit 1; }

echo
log "Издаване на сертификат за: $DOMAIN  (имейл за известия: $EMAIL)"
[ "$STAGING" = "1" ] && log "РЕЖИМ STAGING: издава се тестов сертификат (браузърът ще го отхвърля)."

# --- 0) Базови проверки ---
command -v "${COMPOSE%% *}" >/dev/null 2>&1 \
  || fail "Липсва Docker. Инсталирай Docker и Docker Compose първо."

# --- 1) Проверка, че домейнът се резолвва (DNS A-запис) ---
log "Проверявам DNS за $DOMAIN…"
resolved_ip=""
if command -v getent >/dev/null 2>&1; then
  resolved_ip="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}')"
fi
if [ -z "$resolved_ip" ] && command -v host >/dev/null 2>&1; then
  resolved_ip="$(host -t A "$DOMAIN" 2>/dev/null | awk '/has address/ {print $4; exit}')"
fi
if [ -z "$resolved_ip" ] && command -v nslookup >/dev/null 2>&1; then
  resolved_ip="$(nslookup "$DOMAIN" 2>/dev/null | awk '/^Address: /{print $2; exit}')"
fi
[ -n "$resolved_ip" ] || fail "Домейнът $DOMAIN не се резолвва (няма A-запис?).
  Насочи A-записа на домейна към публичния IP на този VPS и изчакай DNS да се обнови."
log "Домейнът сочи към IP: $resolved_ip"

# Информативно: сравни с публичния IP на сървъра (ако може да се вземе).
server_ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
if [ -n "$server_ip" ] && [ "$server_ip" != "$resolved_ip" ]; then
  log "ВНИМАНИЕ: публичният IP на сървъра ($server_ip) се различава от IP-то в DNS ($resolved_ip)."
  log "         Ако ползваш Cloudflare proxy или друг VPS, провери, че сочиш правилния адрес."
fi

# --- 2) Подготовка на папките (само създаване, без триене) ---
mkdir -p "$WEBROOT_DIR" "$CERTS_DIR"

# --- 3) Провери, че nginx обслужва webroot-а на порт 80 ---
# nginx трябва да е вдигнат и да монтира $WEBROOT_DIR като /var/www/certbot.
# Долу слагаме тестов файл и проверяваме, че се чете през HTTP.
if ! $COMPOSE ps nginx >/dev/null 2>&1 || [ -z "$($COMPOSE ps -q nginx 2>/dev/null)" ]; then
  fail "Услугата nginx не е стартирана. Пусни първо: $COMPOSE up -d"
fi

# ВАЖНО: за да работи webroot методът, nginx трябва да монтира папката certbot.
# Провери дали в docker-compose.yml услугата nginx има ред:
#     - ./nginx/certbot:/var/www/certbot
# Ако го няма, добави го под volumes на nginx и направи: $COMPOSE up -d nginx
probe=".acme-probe-$$"
echo "ok" > "$WEBROOT_DIR/$probe"
log "Проверявам, че http://$DOMAIN/.well-known/acme-challenge/ е достъпно през nginx…"
if ! curl -fsS --max-time 10 "http://$DOMAIN/.well-known/acme-challenge/$probe" 2>/dev/null | grep -q ok; then
  rm -f "$WEBROOT_DIR/$probe"
  fail "Не успях да прочета тестовия файл през HTTP.
  Възможни причини:
    - nginx НЕ монтира ./nginx/certbot като /var/www/certbot
      → добави в docker-compose.yml под nginx volumes:  - ./nginx/certbot:/var/www/certbot
        после: $COMPOSE up -d nginx
    - порт 80 не е отворен в защитната стена/облачния firewall на VPS-а;
    - DNS още не е стигнал до този сървър."
fi
rm -f "$WEBROOT_DIR/$probe"
log "Webroot е достъпен. Продължавам към издаване на сертификата."

# --- 4) Издаване чрез временен certbot контейнер ---
staging_flag=""
[ "$STAGING" = "1" ] && staging_flag="--staging"

log "Стартирам certbot (еднократен контейнер)…"
docker run --rm \
  -v "$ROOT_DIR/nginx/letsencrypt:/etc/letsencrypt" \
  -v "$WEBROOT_DIR:/var/www/certbot" \
  certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos --no-eff-email \
    --non-interactive \
    $staging_flag \
  || fail "certbot не успя да издаде сертификат. Виж съобщенията по-горе."

# --- 5) Копиране на сертификатите там, където nginx 443 блокът ги чака ---
live_dir="$ROOT_DIR/nginx/letsencrypt/live/$DOMAIN"
[ -f "$live_dir/fullchain.pem" ] || fail "Очаквах $live_dir/fullchain.pem, но го няма."
cp "$live_dir/fullchain.pem" "$CERTS_DIR/fullchain.pem"
cp "$live_dir/privkey.pem"   "$CERTS_DIR/privkey.pem"
log "Сертификатите са копирани в: $CERTS_DIR (fullchain.pem, privkey.pem)"

# --- Успех: ясни инструкции на български какво да направи операторът сега ---
cat <<EOF

============================================================
  УСПЕХ! Сертификатът за $DOMAIN е издаден.
============================================================

Сега ВКЛЮЧИ HTTPS на ръка (в този ред):

  1) В docker-compose.yml, услуга "nginx":
       - разкоментирай реда:        # - "443:443"
       - разкоментирай монтирането: # - ./nginx/certs:/etc/nginx/certs:ro
       - увери се, че certbot папката е монтирана (нужно за подновяване):
                                      - ./nginx/certbot:/var/www/certbot

  2) В nginx/zabobovdol.conf:
       - разкоментирай целия блок:   server { listen 443 ssl; ... }
       - разкоментирай пренасочването 80 → 443 в server-а на порт 80:
            location / { return 301 https://\$host\$request_uri; }

  3) Приложи промените и рестартирай nginx:
       $COMPOSE up -d

  4) Провери: отвори https://$DOMAIN в браузър (трябва зелено катинарче).

  Подновяване (Let's Encrypt важи 90 дни):
     docker run --rm \\
       -v "$ROOT_DIR/nginx/letsencrypt:/etc/letsencrypt" \\
       -v "$WEBROOT_DIR:/var/www/certbot" \\
       certbot/certbot renew
     cp "$live_dir/fullchain.pem" "$CERTS_DIR/fullchain.pem"
     cp "$live_dir/privkey.pem"   "$CERTS_DIR/privkey.pem"
     $COMPOSE restart nginx
  (сложи това в cron, напр. веднъж седмично.)

============================================================
EOF

[ "$STAGING" = "1" ] && echo "ЗАБЕЛЕЖКА: това е STAGING сертификат. Пусни пак БЕЗ STAGING=1 за истински."
log "Готово."
