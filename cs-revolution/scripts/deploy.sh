#!/bin/bash
# ═══════════════════════════════════════════════════
# Carbon Stealth Revolution — VPS Deploy Script
# Target: 178.104.77.242 (Hetzner Ubuntu 24.04)
# ═══════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════"
echo "  CARBON STEALTH REVOLUTION — DEPLOY"
echo "═══════════════════════════════════════════"

# Config
DOMAIN="carbonstealth.eu"
DEPLOY_DIR="/var/www/${DOMAIN}"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}"

# Step 1: Install dependencies and build
echo "[1/6] Installing dependencies..."
npm install

echo "[2/6] Building production bundle..."
npm run build

echo "  ✓ Build complete: $(du -sh dist | cut -f1)"

# Step 3: Create deploy directory
echo "[3/6] Setting up deploy directory..."
sudo mkdir -p ${DEPLOY_DIR}
sudo cp -r dist/* ${DEPLOY_DIR}/
sudo chown -R www-data:www-data ${DEPLOY_DIR}

# Step 4: Install Nginx config
echo "[4/6] Configuring Nginx..."
sudo cp nginx/carbonstealth.conf ${NGINX_CONF}

# Remove rate limiting from inside server block (it must be in http context)
# The limit_req_zone line should be in /etc/nginx/nginx.conf http{} block
if ! grep -q "cs_limit" /etc/nginx/nginx.conf 2>/dev/null; then
    echo "  NOTE: Add this line to /etc/nginx/nginx.conf inside http{} block:"
    echo '  limit_req_zone $binary_remote_addr zone=cs_limit:10m rate=30r/s;'
fi

# Enable site
if [ ! -L ${NGINX_LINK} ]; then
    sudo ln -s ${NGINX_CONF} ${NGINX_LINK}
fi

# Step 5: SSL with Let's Encrypt
echo "[5/6] Checking SSL..."
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    echo "  Obtaining SSL certificate..."
    sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --email info@${DOMAIN}
else
    echo "  ✓ SSL certificate exists"
fi

# Step 6: Reload Nginx
echo "[6/6] Testing and reloading Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ DEPLOYED SUCCESSFULLY"
echo "  https://${DOMAIN}"
echo "═══════════════════════════════════════════"
echo ""
echo "Files deployed to: ${DEPLOY_DIR}"
echo "Nginx config: ${NGINX_CONF}"
echo "Build size: $(du -sh dist | cut -f1)"
echo ""
