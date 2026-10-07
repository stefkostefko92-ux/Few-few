#!/bin/bash
set -e
DOMAIN="sklad.carbonstealth.eu"
INSTALL_DIR="/var/www/sklad"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}"

echo "═══ СКЛАД АВТОЧАСТИ v3 — Деплой ═══"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
    echo "📁 Копиране в ${INSTALL_DIR}..."
    mkdir -p "$INSTALL_DIR"
    cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR"/
    cp "$SCRIPT_DIR"/.env "$INSTALL_DIR"/ 2>/dev/null || true
    cp "$SCRIPT_DIR"/.gitignore "$INSTALL_DIR"/ 2>/dev/null || true
fi

cd "$INSTALL_DIR"

# SSL
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo "🔒 SSL..."
    cat > "$NGINX_CONF" << TMPEOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 503; }
}
TMPEOF
    ln -sf "$NGINX_CONF" "$NGINX_LINK"
    nginx -t 2>/dev/null && systemctl reload nginx
    certbot certonly --webroot -w /var/www/html -d $DOMAIN \
        --non-interactive --agree-tos -m admin@carbonstealth.eu
fi

# Nginx
echo "⚙️  Nginx..."
cp "$INSTALL_DIR/nginx-host.conf" "$NGINX_CONF"
ln -sf "$NGINX_CONF" "$NGINX_LINK"
nginx -t 2>&1 && systemctl reload nginx && echo "   ✅ OK"

# Docker
echo "🐳 Docker..."
cd "$INSTALL_DIR"
docker compose down --remove-orphans 2>/dev/null || true
for PORT in 4100 4180; do
    PID=$(lsof -ti :$PORT 2>/dev/null) && kill -9 $PID 2>/dev/null || true
done
docker compose build --no-cache backend
docker compose up -d

# Health
echo "⏳ Чакам..."
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:4100/api/health > /dev/null 2>&1; then
        echo "✅ Backend OK!"
        USERS=$(curl -sf http://127.0.0.1:4100/api/auth/users | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
        PARTS=$(curl -sf http://127.0.0.1:4100/api/health | python3 -c "print('ok')" 2>/dev/null || echo "?")
        echo "   Потребители: $USERS"
        break
    fi
    [ $i -eq 30 ] && echo "❌ Timeout — docker compose logs backend"
    sleep 2
done

echo ""
echo "═══════════════════════════════════════"
echo "✅ https://${DOMAIN}"
echo "📂 ${INSTALL_DIR}"
echo "📋 cd $INSTALL_DIR && docker compose logs -f backend"
echo "═══════════════════════════════════════"
