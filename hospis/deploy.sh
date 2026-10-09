#!/bin/bash
# Деплой на сайта на Хоспис „Борис Дали“ на VPS-а
# Пускай ТОВА НА VPS-а, след като качиш съдържанието на папката hospis/ (tarball/scp).
#
# Ред на стъпките (важно): пълният nginx конфиг сочи сертификата на Let's Encrypt →
# не може да се инсталира ПРЕДИ сертификатът да съществува (nginx -t пада). Затова при
# първи деплой: временен HTTP-only конфиг → сертификат през webroot → пълният конфиг.

set -e

DOMAIN="hospis.carbonstealth.eu"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

echo "═══════════════════════════════════════════"
echo "  Deploying Хоспис „Борис Дали“"
echo "  Domain: $DOMAIN"
echo "═══════════════════════════════════════════"

# 1. Web root
echo "[1/6] Creating web root..."
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "$WEB_ROOT/assets"   # без остарели файлове (напр. заменени снимки)
sudo cp -r ./*.html assets favicon.svg apple-touch-icon.png robots.txt sitemap.xml llms.txt indexnow-key.txt site.webmanifest .well-known "$WEB_ROOT"/
sudo chown -R www-data:www-data "$WEB_ROOT"
sudo chmod -R 755 "$WEB_ROOT"

# 2. SSL сертификат (bootstrap при първи деплой)
if [ ! -f "$CERT" ]; then
    echo "[2/6] No certificate yet — bootstrapping (HTTP-only nginx + webroot)..."
    sudo tee "$NGINX_CONF" >/dev/null <<CONF
server {
    listen 80;
    server_name $DOMAIN;
    root $WEB_ROOT;
}
CONF
    sudo ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
    sudo nginx -t
    sudo systemctl reload nginx
    sudo certbot certonly --webroot -w "$WEB_ROOT" -d "$DOMAIN" \
        --non-interactive --agree-tos --email admin@carbonstealth.eu
else
    echo "[2/6] Certificate exists — skipping bootstrap."
fi

# 3. Пълният nginx конфиг (сертификатът вече съществува)
echo "[3/6] Installing nginx config..."
sudo cp nginx.conf "$NGINX_CONF"
sudo ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"

# 4. Тест
echo "[4/6] Testing nginx config..."
sudo nginx -t

# 5. Reload
echo "[5/6] Reloading nginx..."
sudo systemctl reload nginx

# 6. Проверка
echo "[6/6] Verifying..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN")
if [ "$HTTP_CODE" = "200" ]; then
    echo ""
    echo "═══════════════════════════════════════════"
    echo "  ✓ DEPLOYED SUCCESSFULLY"
    echo "  https://$DOMAIN"
    echo "  Следва: node tools/seo/indexnow.mjs https://$DOMAIN"
    echo "═══════════════════════════════════════════"
else
    echo ""
    echo "  ⚠ HTTP $HTTP_CODE — check nginx error log"
    echo "  sudo tail -20 /var/log/nginx/hospis.error.log"
fi
