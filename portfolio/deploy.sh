#!/usr/bin/env bash
# deploy.sh — деплой на портфолиото на VPS-а (Nginx, статични файлове). Пуска се НА сървъра от
# папката portfolio/ на разархивирания GitHub архив:
#   sudo bash portfolio/deploy.sh
# Идемпотентен: билд → атомарна смяна на web root-а → (сертификат при първи път) → nginx reload → health.
# Nginx конфигът е ФАЙЛ в репото (nginx.conf), не се пише на ръка на сървъра.
set -euo pipefail

DOMAIN="portfolio.carbonstealth.eu"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "══ Carbon Stealth Portfolio → https://$DOMAIN"

# 1. Билд (нула зависимости; Node ≥20 е на машината заради другите продукти)
echo "[1/6] Билд…"
( cd "$HERE" && node build.mjs )

# 2. Атомарна смяна: нов root до стария, после mv (нула секунди без сайт)
echo "[2/6] Публикуване на файловете…"
mkdir -p "$WEB_ROOT.new"
cp -r "$HERE/dist/." "$WEB_ROOT.new/"
chown -R www-data:www-data "$WEB_ROOT.new"
chmod -R 755 "$WEB_ROOT.new"
if [ -d "$WEB_ROOT" ]; then rm -rf "$WEB_ROOT.prev"; mv "$WEB_ROOT" "$WEB_ROOT.prev"; fi
mv "$WEB_ROOT.new" "$WEB_ROOT"

# 3. Сертификат при първи деплой (кокошката и яйцето: пълният конфиг сочи сертификата → първо HTTP-only)
if [ ! -f "$CERT" ]; then
  echo "[3/6] Няма сертификат — bootstrap през webroot…"
  cat > "$NGINX_CONF" <<NG
server { listen 80; server_name $DOMAIN; root $WEB_ROOT; }
NG
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w "$WEB_ROOT" -d "$DOMAIN" --non-interactive --agree-tos --email admin@carbonstealth.eu
else
  echo "[3/6] Сертификатът съществува."
fi

# 4. Пълният конфиг от репото
echo "[4/6] Nginx конфиг…"
cp "$HERE/nginx.conf" "$NGINX_CONF"
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t

# 5. Reload
echo "[5/6] Reload…"
systemctl reload nginx

# 6. Health: и трите езика трябва да отговарят 200
echo "[6/6] Проверка…"
for p in /bg/ /en/ /it/; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN$p")"
  if [ "$code" != "200" ]; then
    echo "✗ $p → HTTP $code — връщам предишната версия"
    if [ -d "$WEB_ROOT.prev" ]; then rm -rf "$WEB_ROOT"; mv "$WEB_ROOT.prev" "$WEB_ROOT"; systemctl reload nginx; fi
    exit 1
  fi
done
echo "✓ Живо: https://$DOMAIN (bg · en · it)"
# IndexNow (Bing/Yandex/Seznam/Naver/Yep) — Google не поддържа; за него sitemap-ът е свеж.
if [ -f "$HERE/../tools/seo/indexnow.mjs" ]; then node "$HERE/../tools/seo/indexnow.mjs" "https://$DOMAIN" || echo "(IndexNow пропуснат)"; fi
