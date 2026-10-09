#!/bin/bash
# Деплой на сайта на Хоспис „Борис Дали“ на VPS-а
# Пускай ТОВА НА VPS-а, след като качиш съдържанието на папката hospis/ (tarball/scp).
# Може да се пуска от всяка папка — скриптът сам влиза в своята.
#
# Ред на стъпките (важно): пълният nginx конфиг сочи сертификата на Let's Encrypt →
# не може да се инсталира ПРЕДИ сертификатът да съществува (nginx -t пада). Затова при
# първи деплой: временен HTTP-only конфиг → сертификат през webroot → пълният конфиг.
# Общият VPS обслужва и други продукти: счупен конфиг не бива да остава активен
# (следващ reload би ги свалил) — затова при неуспешен `nginx -t` старият се връща.

set -euo pipefail
cd "$(dirname "$0")"

DOMAIN="hospis.carbonstealth.eu"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
NGINX_LINK="/etc/nginx/sites-enabled/$DOMAIN"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

echo "═══════════════════════════════════════════"
echo "  Deploying Хоспис „Борис Дали“"
echo "  Domain: $DOMAIN"
echo "═══════════════════════════════════════════"

# nginx -t със заден ход: ако падне, връщаме предишния конфиг (или махаме новия).
install_conf() {
    local src="$1"
    [ -f "$NGINX_CONF" ] && sudo cp "$NGINX_CONF" "$NGINX_CONF.bak"
    sudo cp "$src" "$NGINX_CONF"
    sudo ln -sf "$NGINX_CONF" "$NGINX_LINK"
    if ! sudo nginx -t; then
        echo "  ✗ nginx -t не мина — връщам предишното състояние"
        if [ -f "$NGINX_CONF.bak" ]; then sudo mv "$NGINX_CONF.bak" "$NGINX_CONF"; else sudo rm -f "$NGINX_LINK" "$NGINX_CONF"; fi
        exit 1
    fi
    sudo rm -f "$NGINX_CONF.bak"
    sudo systemctl reload nginx
}

# 1. Web root — първо се събира в staging; живите файлове се пипат чак ако копирането е успяло
echo "[1/6] Preparing web root..."
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -r ./*.html assets favicon.svg apple-touch-icon.png robots.txt sitemap.xml llms.txt indexnow-key.txt site.webmanifest .well-known "$STAGE"/
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "$WEB_ROOT/assets"   # без остарели файлове (напр. заменени снимки)
sudo cp -r "$STAGE"/. "$WEB_ROOT"/
sudo chown -R www-data:www-data "$WEB_ROOT"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} +
sudo find "$WEB_ROOT" -type f -exec chmod 644 {} +

# 2. SSL сертификат (bootstrap при първи деплой)
if [ ! -f "$CERT" ]; then
    echo "[2/6] No certificate yet — bootstrapping (HTTP-only nginx + webroot)..."
    BOOT="$STAGE/bootstrap.conf"
    printf 'server {\n    listen 80;\n    server_name %s;\n    root %s;\n}\n' "$DOMAIN" "$WEB_ROOT" > "$BOOT"
    install_conf "$BOOT"
    sudo certbot certonly --webroot -w "$WEB_ROOT" -d "$DOMAIN" \
        --non-interactive --agree-tos --email admin@carbonstealth.eu
else
    echo "[2/6] Certificate exists — skipping bootstrap."
fi

# 3–5. Пълният nginx конфиг (сертификатът вече съществува): копиране → тест → reload
echo "[3/6] Installing nginx config..."
echo "[4/6] Testing nginx config..."
echo "[5/6] Reloading nginx..."
install_conf nginx.conf

# 6. Проверка (неуспех = ненулев изход)
echo "[6/6] Verifying..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/")
if [ "$HTTP_CODE" != "200" ]; then
    echo ""
    echo "  ✗ https://$DOMAIN/ върна HTTP $HTTP_CODE (очаква се 200)"
    echo "  sudo tail -20 /var/log/nginx/hospis.error.log"
    exit 1
fi
echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ DEPLOYED SUCCESSFULLY"
echo "  https://$DOMAIN"
echo "  Следва: node tools/seo/indexnow.mjs https://$DOMAIN"
echo "═══════════════════════════════════════════"
