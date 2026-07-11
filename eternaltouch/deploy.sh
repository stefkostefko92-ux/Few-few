#!/bin/bash
# ============================================================
#  ETERNAL TOUCH — One-shot deployment
#  Works from any directory. Run as root.
# ============================================================

set -e

# Get the directory where this script lives (works from anywhere)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

DOMAIN="eternaltouch.it"
WWW_DOMAIN="www.eternaltouch.it"
ADMIN_EMAIL="info@eternaltouch.it"
VPS_IP="178.104.77.242"

banner() {
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════════════"
}

ok() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }

banner "ETERNAL TOUCH — DEPLOYMENT"
echo "  Working directory: $SCRIPT_DIR"

# ── Sanity checks ───────────────────────────────────────────
[ "$EUID" -eq 0 ] || fail "Run as root (sudo ./deploy.sh)"
[ -f .env ]               || fail ".env not found in $SCRIPT_DIR"
[ -f docker-compose.yml ] || fail "docker-compose.yml not found in $SCRIPT_DIR"
[ -f Dockerfile ]         || fail "Dockerfile not found in $SCRIPT_DIR"
ok "Pre-flight checks passed"

# ── Check prerequisites ─────────────────────────────────────
banner "1/7  Checking prerequisites"
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi
command -v nginx   >/dev/null 2>&1 || apt-get install -y nginx
command -v certbot >/dev/null 2>&1 || apt-get install -y certbot python3-certbot-nginx
command -v dig     >/dev/null 2>&1 || apt-get install -y dnsutils
ok "Docker, Nginx, Certbot present"

# ── Permissions ─────────────────────────────────────────────
chmod 600 .env
[ -f CREDENTIALS.txt ] && chmod 600 CREDENTIALS.txt
ok "Sensitive file permissions set (600)"

# Ensure uploads directories exist + chown to container UID (1001 = etuser)
mkdir -p src/public/uploads/products \
         src/public/uploads/gallery \
         src/public/uploads/collections \
         src/public/uploads/seed \
         src/public/uploads/hero
chown -R 1001:1001 src/public/uploads
ok "Uploads directory permissions set for container UID 1001"

# ── Build & start containers ────────────────────────────────
banner "2/7  Building and starting containers"
docker compose down 2>/dev/null || true
docker compose up -d --build
ok "Containers running"

# ── Wait for DB ─────────────────────────────────────────────
banner "3/7  Waiting for PostgreSQL"
DB_READY=0
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U eternaltouch >/dev/null 2>&1; then
    ok "PostgreSQL ready"
    DB_READY=1
    break
  fi
  echo "  waiting... ($i/30)"
  sleep 2
done
[ "$DB_READY" -eq 1 ] || fail "PostgreSQL didn't become ready within 60s — check: docker compose logs postgres"

# ── Seed database ───────────────────────────────────────────
banner "4/7  Seeding database"

# Schema is already pushed by docker-startup.sh on container boot.
# Here we just check and seed.
log_attempt() { echo "  [$(date -u +%H:%M:%S)] $*"; }

# Wait for app container to be ready (already running prisma db push internally)
log_attempt "waiting for app container to finish DB schema sync..."
for i in $(seq 1 30); do
  if docker compose exec -T app sh -c "wget -q -O- http://localhost:4300/healthz | grep -q '\"ok\":true'" 2>/dev/null; then
    ok "app container healthy, schema is in sync"
    break
  fi
  sleep 2
  if [ $i -eq 30 ]; then
    echo "  ⚠️  app container not healthy after 60s — will continue and let seed try anyway"
  fi
done

# Seed is idempotent (uses upsert)
log_attempt "running seed (upsert mode)..."
if docker compose exec -T app node prisma/seed.js 2>&1; then
  ok "Seeded (admin + 3 collections + 4 products + 3 gallery + 28+ content keys)"
else
  echo "  ⚠️  Seed encountered an issue but the container is up. Check logs:"
  echo "      docker compose logs app | tail -50"
  echo "  You can manually re-run seed later: docker compose exec app node prisma/seed.js"
fi

# ── Nginx & SSL — 2-stage approach ──────────────────────────
# Stage 1: HTTP-only stub config so certbot can do ACME challenge.
#          Full SSL config can't be loaded yet because cert doesn't exist.
banner "5/7  Configuring Nginx (stage 1: HTTP for ACME)"
mkdir -p /var/www/certbot
cat > /etc/nginx/sites-available/eternaltouch.conf << 'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name eternaltouch.it www.eternaltouch.it;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:4300;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/eternaltouch.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t || fail "Nginx stub config invalid"
systemctl reload nginx
ok "Nginx HTTP stub active"

# ── DNS check ───────────────────────────────────────────────
banner "6/7  Verifying DNS"
RESOLVED=$(dig +short "$DOMAIN" @8.8.8.8 | tail -n1)
if [ "$RESOLVED" = "$VPS_IP" ]; then
  ok "DNS for $DOMAIN points to $VPS_IP"
else
  echo "⚠️  DNS for $DOMAIN resolves to '$RESOLVED' (expected $VPS_IP)"
  echo "   Continuing anyway — certbot may fail if DNS isn't ready."
  read -p "   Press ENTER to continue or Ctrl+C to abort..." _
fi

# ── SSL — Stage 2: get cert (webroot mode, no nginx modification) ──
banner "7/7  Issuing SSL & swapping to full hardened config"
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  ok "SSL certificate already exists — skipping issuance"
else
  certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" -d "$WWW_DOMAIN" \
    --non-interactive --agree-tos \
    -m "$ADMIN_EMAIL" \
    --deploy-hook "systemctl reload nginx"
  ok "SSL certificate issued"
fi

# Ensure future automatic renewals reload nginx (idempotent). Without a deploy
# hook, `certbot.timer` renews the cert on disk but nginx keeps serving the old
# one until a manual reload — with short-lived (ARI) certs that means an outage.
RENEWAL_CONF="/etc/letsencrypt/renewal/$DOMAIN.conf"
if [ -f "$RENEWAL_CONF" ] && ! grep -q "^renew_hook" "$RENEWAL_CONF"; then
  printf 'renew_hook = systemctl reload nginx\n' >> "$RENEWAL_CONF"
  ok "Added nginx reload deploy-hook to certbot renewal"
fi

# Now swap to the full hardened nginx config (which references the cert)
cp nginx/eternaltouch.conf /etc/nginx/sites-available/eternaltouch.conf
nginx -t || fail "Full nginx config invalid"
systemctl reload nginx
ok "Full SSL config active"

# Auto-renewal verification
systemctl list-timers certbot.timer >/dev/null 2>&1 || systemctl enable --now certbot.timer >/dev/null 2>&1 || true
ok "Certbot auto-renewal enabled"

# ── Final ───────────────────────────────────────────────────
banner "DEPLOYMENT COMPLETE"
echo ""
echo "  🌐 Site:      https://$DOMAIN"
echo "  🔐 Admin:     https://$DOMAIN/admin"
echo "  📧 Email:     $ADMIN_EMAIL"
echo "  🗝️  Password:  see CREDENTIALS.txt in $SCRIPT_DIR"
echo ""
echo "  📂 Project:   $SCRIPT_DIR"
echo ""
echo "  Health check:"
echo "    curl -I https://$DOMAIN"
echo "    curl https://$DOMAIN/sitemap.xml | head -5"
echo ""
echo "  Logs:"
echo "    cd $SCRIPT_DIR && docker compose logs -f app"
echo ""
echo "  ⚠️  Change ADMIN_PASSWORD on first login → /admin/settings"
echo ""
