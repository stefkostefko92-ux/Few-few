#!/usr/bin/env bash
# Деплой на V.F.R. (статичен сайт) на VPS-а. Пуска се НА сървъра от разархивираната папка vfr/.
# Идемпотентен. При първи деплой: HTTP-only nginx → certbot webroot → пълен конфиг (кокошката и яйцето:
# пълният конфиг сочи сертификат, който още не съществува).
set -euo pipefail

DOMAIN="${DOMAIN:-vfr.carbonstealth.eu}"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== V.F.R. → $DOMAIN"

echo "[1/5] Файлове → $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete \
  --include='index.html' --include='privacy.html' --include='404.html' \
  --include='robots.txt' --include='sitemap.xml' --include='llms.txt' --include='indexnow-key.txt' \
  --include='css/***' --include='js/***' --include='images/***' --include='fonts/***' --include='.well-known/***' \
  --exclude='*' "$SRC/" "$WEB_ROOT/"
sudo chown -R www-data:www-data "$WEB_ROOT"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} + -o -type f -exec chmod 644 {} +

if [ ! -f "$CERT" ]; then
  echo "[2/5] Няма сертификат — bootstrap (HTTP-only + webroot)"
  sudo tee "$NGINX_CONF" >/dev/null <<NG
server { listen 80; listen [::]:80; server_name $DOMAIN; root $WEB_ROOT; }
NG
  sudo ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot certonly --webroot -w "$WEB_ROOT" -d "$DOMAIN" --non-interactive --agree-tos --email admin@carbonstealth.eu
else
  echo "[2/5] Сертификатът съществува"
fi

echo "[3/5] Nginx конфиг"
sudo sed "s/vfr\.carbonstealth\.eu/$DOMAIN/g" "$SRC/nginx.conf" | sudo tee "$NGINX_CONF" >/dev/null
sudo ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"

echo "[4/5] nginx -t + reload"
sudo nginx -t
sudo systemctl reload nginx

echo "[5/5] Проверка"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/")"
if [ "$CODE" = "200" ]; then
  echo "✓ https://$DOMAIN/ → 200"
  echo "  IndexNow: node tools/seo/indexnow.mjs https://$DOMAIN (от репото)"
else
  echo "✗ HTTP $CODE — виж /var/log/nginx/vfr.error.log" >&2
  exit 1
fi
