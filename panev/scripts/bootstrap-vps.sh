#!/usr/bin/env bash
# ============================================================
#  PANEV ASCENSORI — VPS Bootstrap (full unattended setup)
#
#  For a FRESH Ubuntu 22.04/24.04 VPS — installs Node.js 20,
#  PM2, Nginx, Certbot, UFW rules, and runs scripts/deploy.sh.
#
#  Usage (as root on the VPS):
#    cd /var/www/panevascensori
#    bash scripts/bootstrap-vps.sh
#
#  Idempotent: safe to re-run.
# ============================================================
set -euo pipefail

if [[ "$(id -u)" != "0" ]]; then
  echo "Questo script richiede privilegi root. Riesegui con: sudo bash $0"
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${DOMAIN:-panevascensori.it}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-info@panevascensori.it}"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${BLUE}[bootstrap]${NC} $1"; }
ok()     { echo -e "${GREEN}[bootstrap]${NC} ✓ $1"; }
warn()   { echo -e "${YELLOW}[bootstrap]${NC} ⚠  $1"; }
banner() { echo ""; echo -e "${BOLD}═══${NC} $1 ${BOLD}═══${NC}"; }

banner "PANEV VPS BOOTSTRAP"
log "Dir:    $APP_DIR"
log "Domain: $DOMAIN"
log "Cert:   $CERTBOT_EMAIL"

# ── 1. System update ─────────────────────────────────────────
banner "1. apt update"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl gnupg ca-certificates git build-essential ufw unzip
ok "Base packages installed"

# ── 2. Node.js 20 ────────────────────────────────────────────
banner "2. Node.js"
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)
  [[ "$NODE_VER" -ge 18 ]] && NODE_OK=1
fi
if [[ "$NODE_OK" != "1" ]]; then
  log "Installing Node.js 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
ok "Node $(node -v) / npm $(npm -v)"

# ── 3. PM2 ───────────────────────────────────────────────────
banner "3. PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2…"
  npm install -g pm2 --silent --no-audit --no-fund
fi
ok "PM2 $(pm2 -v)"

# ── 4. Nginx ─────────────────────────────────────────────────
banner "4. Nginx"
if ! command -v nginx >/dev/null 2>&1; then
  log "Installing Nginx…"
  apt-get install -y -qq nginx
fi
systemctl enable nginx >/dev/null 2>&1 || true
systemctl start nginx >/dev/null 2>&1 || true
ok "Nginx $(nginx -v 2>&1 | cut -d/ -f2)"

# ── 4b. PHP-FPM + sendmail ──────────────────────────────────
banner "4b. PHP-FPM + mail"
PHP_VERSION=""
if ! command -v php >/dev/null 2>&1; then
  log "Installing PHP 8.3 FPM + mailer…"
  apt-get install -y -qq software-properties-common
  apt-get install -y -qq php-fpm php-cli php-curl php-mbstring php-json \
                         postfix mailutils 2>/dev/null || true
  # Configure postfix to send as localhost (simplest — uses system mail)
  # In production, may want to configure SMTP relay via Aruba later
fi
PHP_VERSION=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "")
if [[ -n "$PHP_VERSION" ]]; then
  systemctl enable php${PHP_VERSION}-fpm >/dev/null 2>&1 || true
  systemctl start php${PHP_VERSION}-fpm >/dev/null 2>&1 || true
  ok "PHP $PHP_VERSION-FPM attivo"
else
  warn "PHP non installato — il form contatti userà solo Node API"
fi

# Ensure log file exists and is writable
touch /var/log/panev-contact.log 2>/dev/null
chmod 666 /var/log/panev-contact.log 2>/dev/null


# ── 5. Certbot ───────────────────────────────────────────────
banner "5. Certbot"
if ! command -v certbot >/dev/null 2>&1; then
  log "Installing Certbot…"
  apt-get install -y -qq certbot python3-certbot-nginx
fi
ok "Certbot $(certbot --version 2>&1 | head -1)"

# ── 6. Firewall ──────────────────────────────────────────────
banner "6. UFW Firewall"
if ufw status | grep -q "Status: inactive"; then
  log "Configuring UFW…"
  ufw --force allow 22/tcp >/dev/null
  ufw --force allow 80/tcp >/dev/null
  ufw --force allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
fi
ok "UFW: $(ufw status | head -1)"

# ── 7. Create data dir permissions ──────────────────────────
banner "7. App directory"
cd "$APP_DIR"
mkdir -p data
chmod 700 data
ok "Data directory ready"

# ── 8. Run deploy ────────────────────────────────────────────
banner "8. Deploy"
bash "$APP_DIR/scripts/deploy.sh"

# ── 9. Nginx config install ──────────────────────────────────
banner "9. Nginx config"
NGINX_SRC="/tmp/nginx-panevascensori.conf"
NGINX_DST="/etc/nginx/sites-available/panevascensori"

if [[ -f "$NGINX_SRC" ]]; then
  log "Installing nginx config…"

  # If the file in sites-available still references letsencrypt certs that don't exist yet,
  # install a HTTP-only version first so nginx can start, then certbot will upgrade it.
  if [[ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    log "Let's Encrypt cert non trovato — install HTTP-only temporaneo"
    PORT_ACTUAL=$(grep -E '^PORT=' "$APP_DIR/.env" | cut -d= -f2)
    cat > "$NGINX_DST" <<EOF
# Temporary HTTP config — certbot will upgrade to HTTPS
upstream panev_backend { server 127.0.0.1:$PORT_ACTUAL; keepalive 32; }
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 2M;
    location = /api/webhook {
        proxy_pass http://panev_backend;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location / {
        proxy_pass http://panev_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Connection "";
    }
}
EOF
  else
    cp "$NGINX_SRC" "$NGINX_DST"
  fi

  ln -sf "$NGINX_DST" /etc/nginx/sites-enabled/panevascensori
  # Remove default if present
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    ok "Nginx config attivo"
  else
    warn "Nginx config ha errori — verifica con: nginx -t"
  fi
else
  warn "Nginx config non generato dal deploy — skip"
fi

# ── 10. SSL via Certbot ──────────────────────────────────────
banner "10. SSL (Let's Encrypt)"
if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
  ok "Certificato già presente per $DOMAIN"
else
  log "Richiedo certificato per $DOMAIN e www.$DOMAIN…"
  if certbot --nginx --non-interactive --agree-tos \
       -m "$CERTBOT_EMAIL" \
       -d "$DOMAIN" -d "www.$DOMAIN" \
       --redirect; then
    ok "Certificato installato + HTTPS redirect attivo"

    # Replace the temporary HTTP-only nginx config with the full HTTPS one
    if [[ -f "$NGINX_SRC" ]]; then
      log "Installing full HTTPS nginx config…"
      cp "$NGINX_SRC" "$NGINX_DST"
      if nginx -t >/dev/null 2>&1; then
        systemctl reload nginx
        ok "HTTPS config attivo"
      else
        warn "Full config ha errori — certbot config è sufficiente"
      fi
    fi
  else
    warn "Certbot ha fallito. Probabili cause:"
    warn "  - DNS di $DOMAIN non punta a questo VPS"
    warn "  - Port 80 bloccato"
    warn "  - Limite rate di Let's Encrypt raggiunto"
    warn "Riprova manualmente: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  fi
fi

# ── 11. PM2 log rotation ─────────────────────────────────────
banner "11. PM2 log rotation"
if pm2 list 2>/dev/null | grep -q pm2-logrotate; then
  ok "pm2-logrotate già installato"
else
  log "Installing pm2-logrotate module…"
  pm2 install pm2-logrotate >/dev/null 2>&1 || warn "pm2 install pm2-logrotate failed"
  pm2 set pm2-logrotate:max_size 10M     >/dev/null 2>&1 || true
  pm2 set pm2-logrotate:retain 14        >/dev/null 2>&1 || true
  pm2 set pm2-logrotate:compress true    >/dev/null 2>&1 || true
  pm2 set pm2-logrotate:rotateInterval '0 2 * * *' >/dev/null 2>&1 || true
  ok "Log rotation: max 10MB, retain 14 files, daily 02:00"
fi

# ── 12. Automated DB backups (cron) ──────────────────────────
banner "12. Backup giornaliero"
mkdir -p /var/backups/panev
chmod 700 /var/backups/panev
apt-get install -y -qq sqlite3 >/dev/null 2>&1 || true

CRON_FILE="/etc/cron.d/panev-backup"
if [[ ! -f "$CRON_FILE" ]]; then
  log "Installing daily backup cron (03:15 UTC)…"
  cat > "$CRON_FILE" <<EOF
# Panev Ascensori — DB daily backup
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root cd $APP_DIR && bash scripts/backup.sh >> /var/log/panev-backup.log 2>&1
EOF
  chmod 644 "$CRON_FILE"
  ok "Cron installato: /etc/cron.d/panev-backup (03:15 daily)"
else
  ok "Cron backup già presente"
fi

# Run first backup immediately to verify it works
log "Test backup…"
if bash "$APP_DIR/scripts/backup.sh" 2>&1 | head -5; then
  ok "Test backup riuscito — vedi /var/backups/panev/"
else
  warn "Test backup fallito — controlla i log"
fi

# ── Done ─────────────────────────────────────────────────────
banner "BOOTSTRAP COMPLETATO"

echo ""
echo -e "  ${GREEN}${BOLD}✓ Sito Panev Ascensori online${NC}"
echo ""
echo "  🌐  https://www.$DOMAIN/"
echo "  🔐  https://www.$DOMAIN/admin/login.html"
echo ""
echo "  Login default:"
echo "    Email:    info@panevascensori.it"
echo "    Password: "
echo ""
echo -e "  ${YELLOW}⚠  CAMBIA LA PASSWORD AL PRIMO LOGIN${NC}"
echo ""
echo "  Comandi utili:"
echo "    pm2 status panev-web        — stato app"
echo "    pm2 logs panev-web          — log live"
echo "    pm2 restart panev-web       — riavvio"
echo "    bash deploy.sh              — re-deploy dopo modifiche"
echo "    bash scripts/backup.sh      — backup manuale"
echo "    ls /var/backups/panev/      — vedi backup giornalieri"
echo "    nginx -t && systemctl reload nginx  — reload nginx"
echo ""
echo "  Monitoring:"
echo "    curl https://www.$DOMAIN/api/health"
echo ""
echo "  Automazioni attive:"
echo "    - DB backup giornaliero alle 03:15 UTC (30 daily + 12 weekly)"
echo "    - PM2 log rotation: max 10MB/file, retain 14"
echo "    - PM2 auto-start al boot"
echo ""
