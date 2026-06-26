#!/usr/bin/env bash
# ============================================================
#  PANEV ASCENSORI — AUTO DEPLOY (v2.0)
#  Target: VPS 178.104.77.242 (Hetzner, Ubuntu 24.04)
#
#  ZERO manual config needed. Just run:
#    cd /var/www/panevascensori
#    bash scripts/deploy.sh
#
#  This script will:
#    1. Auto-generate .env with strong JWT_SECRET (if missing)
#    2. Install Node deps (production only)
#    3. Seed SQLite DB with 27 products + admin user
#    4. Start/reload PM2 app 'panev-web' on port 4102
#    5. Write Nginx config to /tmp/nginx-panev.conf for you to install
#    6. Run smoke tests and report
# ============================================================
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()    { echo -e "${BLUE}[deploy]${NC} $1"; }
ok()     { echo -e "${GREEN}[deploy]${NC} ✓ $1"; }
warn()   { echo -e "${YELLOW}[deploy]${NC} ⚠  $1"; }
err()    { echo -e "${RED}[deploy]${NC} ✗ $1" >&2; }
banner() { echo ""; echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"; echo -e "  ${BOLD}$1${NC}"; echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"; }

# ── Paths ───────────────────────────────────────────────────
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# ── Defaults (override via env vars before running) ─────────
DEFAULT_PORT="${PORT:-4102}"
DEFAULT_DOMAIN="${DOMAIN:-panevascensori.it}"
DEFAULT_EMAIL="${ADMIN_EMAIL:-info@panevascensori.it}"
DEFAULT_ADMIN_PW="${ADMIN_PASSWORD:-Panev2024!}"
PM2_APP_NAME="${PM2_APP_NAME:-panev-web}"

banner "PANEV ASCENSORI — AUTO DEPLOY v2.0"
log "Directory:  $APP_DIR"
log "Port:       $DEFAULT_PORT"
log "Domain:     $DEFAULT_DOMAIN"

# ──────────────────────────────────────────────────────────
#  1. PREREQUISITES
# ──────────────────────────────────────────────────────────
banner "1. Prerequisites"

if ! command -v node >/dev/null 2>&1; then
  err "Node.js non installato."
  log "Installa con:"
  log "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -"
  log "  sudo apt-get install -y nodejs"
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if (( NODE_MAJOR < 18 )); then
  err "Node v$(node -v) è troppo vecchio (serve >= 18)"
  exit 1
fi
ok "Node $(node -v)"

if ! command -v npm >/dev/null 2>&1; then
  err "npm non trovato"
  exit 1
fi
ok "npm $(npm -v)"

# PM2 autoinstall if missing
if ! command -v pm2 >/dev/null 2>&1; then
  warn "PM2 non installato — installo globalmente…"
  npm install -g pm2 --silent --no-audit --no-fund
  ok "PM2 installato"
else
  ok "PM2 $(pm2 -v)"
fi

# ──────────────────────────────────────────────────────────
#  2. .env AUTO-GENERATION
# ──────────────────────────────────────────────────────────
banner "2. Configuration (.env)"

if [[ -f .env ]]; then
  log ".env esiste già — mantengo le impostazioni correnti"

  # Upgrade check: if JWT_SECRET is still placeholder, replace it
  if grep -qE '^JWT_SECRET=(CHANGE-ME|$)' .env; then
    warn "JWT_SECRET è un placeholder — lo sostituisco con un valore sicuro"
    NEW_JWT=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    if grep -qE '^JWT_SECRET=' .env; then
      sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_JWT|" .env
    else
      echo "JWT_SECRET=$NEW_JWT" >> .env
    fi
    ok "JWT_SECRET rigenerato (128 hex chars)"
  fi
else
  log ".env mancante — genero automaticamente…"
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  cat > .env <<EOF
# ============================================================
#  PANEV ASCENSORI — Auto-generated .env
#  Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ") by scripts/deploy.sh
#  Keep this file SECRET. Never commit to git.
# ============================================================

# ── Server ─────────────────────────────────────────────────
NODE_ENV=production
PORT=$DEFAULT_PORT
BASE_URL=https://www.$DEFAULT_DOMAIN

# ── JWT (auto-generated, 64 random bytes) ──────────────────
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES=4h

# ── Database ───────────────────────────────────────────────
DB_PATH=$APP_DIR/data/panev.db

# ── Admin iniziale (usato solo al primo seed) ──────────────
ADMIN_EMAIL=$DEFAULT_EMAIL
ADMIN_PASSWORD=$DEFAULT_ADMIN_PW

# ── Stripe (configura manualmente dopo il deploy) ──────────
# Dashboard: https://dashboard.stripe.com/apikeys
# Senza queste chiavi, /api/create-checkout-session restituisce 503.
# Il flusso "Richiedi Preventivo" del carrello funziona comunque.
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
EOF
  chmod 600 .env
  ok ".env generato e protetto (chmod 600)"
fi

# ──────────────────────────────────────────────────────────
#  3. NPM INSTALL (production)
# ──────────────────────────────────────────────────────────
banner "3. Dipendenze"

if [[ -d node_modules ]] && [[ -f package-lock.json ]]; then
  log "node_modules esiste — uso 'npm ci' per installazione pulita…"
  npm ci --omit=dev --silent --no-audit --no-fund 2>&1 | tail -3 || {
    warn "npm ci fallito — provo npm install…"
    npm install --omit=dev --silent --no-audit --no-fund 2>&1 | tail -3
  }
else
  log "Installazione pulita (npm install --omit=dev)…"
  npm install --omit=dev --silent --no-audit --no-fund 2>&1 | tail -3
fi
ok "Dipendenze installate"

# ──────────────────────────────────────────────────────────
#  4. DATABASE SEED (idempotent)
# ──────────────────────────────────────────────────────────
banner "4. Database"

mkdir -p data
chmod 700 data

# Load env for seed (ADMIN_EMAIL/ADMIN_PASSWORD)
set -a
source .env
set +a

node scripts/seed.js
ok "Database inizializzato"

# ──────────────────────────────────────────────────────────
#  5. PM2 START/RELOAD
# ──────────────────────────────────────────────────────────
banner "5. Avvio applicazione"

if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  log "App '$PM2_APP_NAME' esiste — reload con env aggiornato…"
  pm2 reload "$PM2_APP_NAME" --update-env >/dev/null
  ok "App ricaricata"
else
  log "App '$PM2_APP_NAME' nuova — start…"
  pm2 start server.js --name "$PM2_APP_NAME" --update-env >/dev/null
  pm2 save >/dev/null
  ok "App avviata"

  # Try to set up PM2 auto-start on boot (works on systemd systems)
  if command -v systemctl >/dev/null 2>&1 && [[ -z "${SKIP_PM2_STARTUP:-}" ]]; then
    STARTUP_CMD=$(pm2 startup systemd -u "${SUDO_USER:-$(whoami)}" --hp "${HOME}" 2>/dev/null | grep -E "^sudo " | tail -1 || true)
    if [[ -n "$STARTUP_CMD" ]] && [[ "$(id -u)" == "0" ]]; then
      log "Configuro PM2 per l'avvio automatico al boot…"
      eval "${STARTUP_CMD#sudo }" >/dev/null 2>&1 || warn "pm2 startup — esegui manualmente: $STARTUP_CMD"
    elif [[ -n "$STARTUP_CMD" ]]; then
      warn "Per avvio al boot, esegui come root: $STARTUP_CMD"
    fi
  fi
fi

sleep 2
pm2 status "$PM2_APP_NAME" | grep -E "(name|$PM2_APP_NAME|online)" | head -5 || true

# ──────────────────────────────────────────────────────────
#  6. SMOKE TESTS
# ──────────────────────────────────────────────────────────
banner "6. Smoke tests"

PORT_ACTUAL=$(grep -E '^PORT=' .env | cut -d= -f2)
TEST_URL="http://127.0.0.1:$PORT_ACTUAL"

sleep 1

# Test 1: products endpoint
if curl -sf -m 5 "$TEST_URL/api/products" >/dev/null; then
  COUNT=$(curl -sf "$TEST_URL/api/products" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).count))")
  ok "/api/products → $COUNT prodotti"
else
  err "/api/products non risponde"
  warn "Controlla i log: pm2 logs $PM2_APP_NAME --lines 30"
fi

# Test 2: health endpoint
if curl -sf -m 5 "$TEST_URL/api/health" >/dev/null; then
  ok "/api/health → ok"
else
  warn "/api/health non risponde"
fi

# Test 2: admin login rejects no-auth
if [[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' $TEST_URL/api/admin/products)" == "401" ]]; then
  ok "/api/admin/products → 401 (auth richiesta) ✓"
else
  warn "/api/admin/products non restituisce 401"
fi

# Test 3: private paths blocked
for p in "/data/panev.db" "/lib/db.js" "/.env"; do
  code=$(curl -s -m 3 -o /dev/null -w '%{http_code}' "$TEST_URL$p")
  if [[ "$code" == "404" ]]; then
    ok "$p → 404 (nascosto)"
  else
    err "$p → $code (dovrebbe essere 404)"
  fi
done

# ──────────────────────────────────────────────────────────
#  7. NGINX CONFIG
# ──────────────────────────────────────────────────────────
banner "7. Nginx config"

NGINX_CONF="/tmp/nginx-panevascensori.conf"

# Detect PHP-FPM socket
PHP_SOCK=""
for v in 8.3 8.2 8.1 8.0 7.4; do
  if [ -S "/run/php/php${v}-fpm.sock" ]; then
    PHP_SOCK="unix:/run/php/php${v}-fpm.sock"
    break
  fi
done

cat > "$NGINX_CONF" <<EOF
# ============================================================
#  Panev Ascensori — Nginx reverse proxy (Node + PHP-FPM)
#  Path: /etc/nginx/sites-available/panevascensori
#  Enable: ln -s /etc/nginx/sites-available/panevascensori /etc/nginx/sites-enabled/
#  SSL:    certbot --nginx -d $DEFAULT_DOMAIN -d www.$DEFAULT_DOMAIN
# ============================================================

upstream panev_backend {
    server 127.0.0.1:$PORT_ACTUAL;
    keepalive 32;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DEFAULT_DOMAIN www.$DEFAULT_DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DEFAULT_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DEFAULT_DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    root $APP_DIR;
    index index.html;

    client_max_body_size 2M;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
    gzip_min_length 1024;

    # ── PHP contact form handler (if PHP-FPM installed) ──
    location = /contact.php {
EOF

if [[ -n "$PHP_SOCK" ]]; then
    cat >> "$NGINX_CONF" <<EOF
        fastcgi_pass $PHP_SOCK;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root/contact.php;
        fastcgi_param QUERY_STRING \$query_string;
        fastcgi_param REQUEST_METHOD \$request_method;
        fastcgi_param CONTENT_TYPE \$content_type;
        fastcgi_param CONTENT_LENGTH \$content_length;
        include fastcgi_params;
        fastcgi_read_timeout 30;
EOF
else
    cat >> "$NGINX_CONF" <<EOF
        # PHP-FPM non disponibile — fallback a Node API
        proxy_pass http://panev_backend/api/contact;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
EOF
fi

cat >> "$NGINX_CONF" <<EOF
    }

    # Deny access to hidden/sensitive files
    location ~ /\. { deny all; return 404; }
    location ~ ^/(lib|scripts|data|node_modules)/ { deny all; return 404; }

    # Stripe webhook: NEVER buffer (needs raw body)
    location = /api/webhook {
        proxy_pass http://panev_backend;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Admin: no caching, noindex
    location /admin/ {
        proxy_pass http://panev_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    # Everything else → Node app
    location / {
        proxy_pass http://panev_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";
    }
}

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name $DEFAULT_DOMAIN www.$DEFAULT_DOMAIN;
    return 301 https://www.$DEFAULT_DOMAIN\$request_uri;
}
EOF

ok "Nginx config generato in: $NGINX_CONF"
log "Per installare (come root):"
log "  cp $NGINX_CONF /etc/nginx/sites-available/panevascensori"
log "  ln -sf /etc/nginx/sites-available/panevascensori /etc/nginx/sites-enabled/"
log "  nginx -t && systemctl reload nginx"
log "  certbot --nginx -d $DEFAULT_DOMAIN -d www.$DEFAULT_DOMAIN"

# ──────────────────────────────────────────────────────────
#  8. SUMMARY
# ──────────────────────────────────────────────────────────
banner "Deploy completato ✓"

echo ""
echo "  🛗  PANEV ASCENSORI — v2.0 live on port $PORT_ACTUAL"
echo ""
echo "  Admin login:  https://www.$DEFAULT_DOMAIN/admin/login.html"
echo "    Email:      $DEFAULT_EMAIL"
echo "    Password:   $DEFAULT_ADMIN_PW"
echo ""
echo -e "  ${YELLOW}⚠  AZIONI MANUALI RIMASTE:${NC}"
echo ""
echo "  1. ${BOLD}CAMBIA LA PASSWORD ADMIN${NC} al primo login"
echo "     (Impostazioni → Cambia Password)"
echo ""
echo "  2. ${BOLD}INSTALLA NGINX CONFIG${NC} (se non già fatto):"
echo "     sudo cp $NGINX_CONF /etc/nginx/sites-available/panevascensori"
echo "     sudo ln -sf /etc/nginx/sites-available/panevascensori /etc/nginx/sites-enabled/"
echo "     sudo nginx -t && sudo systemctl reload nginx"
echo "     sudo certbot --nginx -d $DEFAULT_DOMAIN -d www.$DEFAULT_DOMAIN"
echo ""
echo "  3. ${BOLD}CONFIGURA STRIPE${NC} (opzionale — per pagamenti):"
echo "     Modifica .env e inserisci STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"
echo "     Poi: pm2 reload $PM2_APP_NAME --update-env"
echo ""
echo "  Status:     pm2 status $PM2_APP_NAME"
echo "  Logs:       pm2 logs $PM2_APP_NAME"
echo "  Restart:    pm2 restart $PM2_APP_NAME"
echo ""
