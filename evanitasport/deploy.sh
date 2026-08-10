#!/bin/bash
# Deploy Evanita Sport to VPS
# Run this ON the VPS after uploading the tarball

set -e

DOMAIN="evanita.carbonstealth.eu"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

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

# 2. Install nginx config
echo "[2/6] Installing nginx config..."
sudo cp nginx.conf $NGINX_CONF
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/$DOMAIN

# 3. Get SSL certificate
echo "[3/6] Obtaining SSL certificate..."
sudo certbot certonly --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@carbonstealth.eu || echo "SSL cert may already exist"

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
