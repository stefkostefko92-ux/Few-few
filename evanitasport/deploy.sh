#!/bin/bash
# Deploy Evanita Sport to VPS
# Run this ON the VPS after uploading the tarball
#
# Ред на стъпките (важно): пълният nginx конфиг сочи сертификата на Let's
# Encrypt → не може да се инсталира ПРЕДИ сертификатът да съществува (nginx -t
# пада с "cannot load certificate", а certbot-ът, който ползва nginx, пада
# заедно с него — кокошката и яйцето). Затова при първи деплой: временен
# HTTP-only конфиг → сертификат през webroot → чак тогава пълният конфиг.

set -e

DOMAIN="evanita-bg.com"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

echo "═══════════════════════════════════════════"
echo "  Deploying Evanita Sport"
echo "  Domain: $DOMAIN"
echo "═══════════════════════════════════════════"

# 1. Create web root
echo "[1/6] Creating web root..."
sudo mkdir -p $WEB_ROOT
sudo cp -r index.html 404.html css js images favicon.svg apple-touch-icon.png robots.txt sitemap.xml llms.txt indexnow-key.txt .well-known $WEB_ROOT/
sudo chown -R www-data:www-data $WEB_ROOT
sudo chmod -R 755 $WEB_ROOT

# 2. SSL certificate (bootstrap при първи деплой)
if [ ! -f "$CERT" ]; then
    echo "[2/6] No certificate yet — bootstrapping (HTTP-only nginx + webroot)..."
    sudo tee $NGINX_CONF >/dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    root $WEB_ROOT;
}
EOF
    sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/$DOMAIN
    sudo nginx -t
    sudo systemctl reload nginx
    sudo certbot certonly --webroot -w $WEB_ROOT -d $DOMAIN -d www.$DOMAIN \
        --non-interactive --agree-tos --email admin@carbonstealth.eu
else
    echo "[2/6] Certificate exists — skipping bootstrap."
fi

# 3. Install full nginx config (сертификатът вече съществува)
echo "[3/6] Installing nginx config..."
sudo cp nginx.conf $NGINX_CONF
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/$DOMAIN

# 4. Test nginx config
echo "[4/6] Testing nginx config..."
sudo nginx -t

# 5. Reload nginx
echo "[5/6] Reloading nginx..."
sudo systemctl reload nginx

# 6. Verify
echo "[6/6] Verifying..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN)
if [ "$HTTP_CODE" = "200" ]; then
    echo ""
    echo "═══════════════════════════════════════════"
    echo "  ✓ DEPLOYED SUCCESSFULLY"
    echo "  https://$DOMAIN"
    echo "═══════════════════════════════════════════"
else
    echo ""
    echo "  ⚠ HTTP $HTTP_CODE — check nginx error log"
    echo "  sudo tail -20 /var/log/nginx/evanita.error.log"
fi
