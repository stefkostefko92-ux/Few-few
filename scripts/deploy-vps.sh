#!/bin/bash
set -e
APP_DIR="${APP_DIR:-/var/www/erp-ascensori}"
DOMAIN="${1:-${DOMAIN:-erp.carbonstealth.eu}}"
CERT_EMAIL="${CERT_EMAIL:-admin@$DOMAIN}"

echo "╔═══════════════════════════════════════════════════════╗"
echo "║   ERP Ascensori Enterprise v3 — DEPLOY PRODUCTION     ║"
echo "║   Dominio: $DOMAIN"
echo "╚═══════════════════════════════════════════════════════╝"

cd "$APP_DIR"

# 1. ENV
echo "[1/6] Configurazione .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  ADMIN_PASSWORD="$(openssl rand -base64 12 | tr -d '/+=')"
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|HMAC_SECRET=.*|HMAC_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" .env
  echo "ADMIN_PASSWORD=$ADMIN_PASSWORD" >> .env
  echo "  ✅ .env creato — password admin generata: $ADMIN_PASSWORD"
  echo "     ⚠️  ANNOTALA ORA: admin@erp-ascensori.it / $ADMIN_PASSWORD"
else
  echo "  ✅ .env esistente"
fi

# Avvisi su variabili vuote richieste in produzione
for var in AZIENDA_NOME AZIENDA_PIVA GEMINI_API_KEY SMTP_HOST; do
  if grep -qE "^$var=$" .env; then
    echo "  ⚠️  $var è vuoto in .env — configuralo per PDF/FatturaPA/AI/email"
  fi
done

# 2. BUILD
echo "[2/6] Build containers..."
docker compose build --no-cache
echo "  ✅ Build completato"

# 3. START (le migrazioni e il seed girano automaticamente all'avvio del backend)
echo "[3/6] Avvio..."
docker compose up -d
echo "  ✅ Containers avviati"

# 4. WAIT
echo "[4/6] Attendo i servizi..."
for i in $(seq 1 60); do
  curl -fs http://127.0.0.1:4100/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -fs http://127.0.0.1:4100/api/health >/dev/null || { echo "  ❌ Backend non risponde: docker compose logs backend"; exit 1; }
echo "  ✅ Backend pronto (migrazioni + seed automatici)"

# 5. NGINX
echo "[5/6] Nginx..."
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  sed "s|erp\.carbonstealth\.eu|$DOMAIN|g" "$APP_DIR/nginx/erp-ascensori.conf" > /etc/nginx/sites-available/erp-ascensori
else
  cat > /etc/nginx/sites-available/erp-ascensori << NGXEOF
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 25m;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location /api/ { proxy_pass http://127.0.0.1:4100; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; }
    location /uploads/ { proxy_pass http://127.0.0.1:4100; proxy_set_header Host \$host; }
    location /socket.io/ { proxy_pass http://127.0.0.1:4100; proxy_http_version 1.1; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; }
    location / { proxy_pass http://127.0.0.1:3100; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; }
}
NGXEOF
fi
ln -sf /etc/nginx/sites-available/erp-ascensori /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo "  ✅ Nginx configurato"

# 6. SSL
echo "[6/6] SSL..."
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  mkdir -p /var/www/certbot
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" 2>/dev/null && echo "  ✅ SSL installato" || echo "  ⚠️  SSL manuale: certbot --nginx -d $DOMAIN"
else
  echo "  ✅ SSL presente"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║   ✅ DEPLOY COMPLETATO!                               ║"
echo "║   🌐 https://$DOMAIN"
echo "║   📧 admin@erp-ascensori.it (password: vedi .env)     ║"
echo "║                                                       ║"
echo "║   docker compose logs -f     (log live)               ║"
echo "║   docker compose restart     (riavvia)                ║"
echo "║   Backup automatici giornalieri in ./backups/         ║"
echo "╚═══════════════════════════════════════════════════════╝"
