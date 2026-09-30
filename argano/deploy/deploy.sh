#!/usr/bin/env bash
# Argano on the VPS: secrets (first time only), backup before the migrations, Docker Compose build and start,
# health with the application marker, nginx vhost and Let's Encrypt certificate. Idempotent. Run as root from the
# argano/ directory of a release (deploy/autodeploy.sh does it for PROJECTS containing "argano"):
#   sudo bash deploy/deploy.sh
# Env: ARGANO_ENV (default /opt/few-few/shared/argano/.env), ARGANO_ADMIN_PASSWORD (first deploy only, random when
# absent), ARGANO_TLS=0 to leave nginx and certbot alone, CERTBOT_EMAIL (default admin@carbonstealth.eu).
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${ARGANO_ENV:-/opt/few-few/shared/argano/.env}"
SHARED="$(dirname "$ENV_FILE")"
TS="$(date -u +%Y%m%d-%H%M%S)"
log()  { printf '\033[1;36m▸ argano: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ argano: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ argano: %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✘ argano: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "run as root (sudo)"
command -v docker >/dev/null || die "docker is missing (Docker Engine + compose plugin)"
rand() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

# 1) secrets live on the server only and are created once
install -d -m 700 "$SHARED"
if [ ! -f "$ENV_FILE" ]; then
  admin_pw="${ARGANO_ADMIN_PASSWORD:-$(rand 20)}"
  (
    umask 077
    cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(rand 32)
AUTH_SECRET=$(rand 48)
APP_PORT=4320
PUBLIC_BASE_URL=https://argano.carbonstealth.eu
ALLOW_INDEXING=false
LOG_LEVEL=info
ADMIN_EMAIL=admin@carbonstealth.eu
ADMIN_PASSWORD=${admin_pw}
ADMIN_NAME=Carbon Stealth VCC
ADMIN_COMPANY=Carbon Stealth VCC
EOF
  )
  warn "created $ENV_FILE — administrator admin@carbonstealth.eu, password: ${admin_pw}"
  warn "store it in the password manager now; remove ADMIN_PASSWORD from the file after the first sign-in"
fi
chmod 600 "$ENV_FILE"
env_get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
PORT="$(env_get APP_PORT | tr -dc '0-9' || true)"
PORT="${PORT:-4320}"
DOMAIN="$(env_get PUBLIC_BASE_URL | sed -E 's#^https?://##; s#[/:].*$##' || true)"
DOMAIN="${DOMAIN:-argano.carbonstealth.eu}"
install -m 600 "$ENV_FILE" .env

# 2) on the first start the port must be free: another project may already hold it
if [ -z "$(docker compose ps -q app 2>/dev/null || true)" ] && ss -Htln "sport = :$PORT" | grep -q .; then
  die "port $PORT is already in use (ss -tlnp): set another APP_PORT in $ENV_FILE"
fi

# 3) backup before the migrations when the database already runs: no backup, no migration
if [ -n "$(docker compose ps -q db 2>/dev/null || true)" ]; then
  install -d -m 700 "$SHARED/backups"
  if docker compose exec -T db pg_dump -U argano argano | gzip > "$SHARED/backups/pre-deploy-$TS.sql.gz"; then
    ok "backup $SHARED/backups/pre-deploy-$TS.sql.gz"
    ls -1t "$SHARED"/backups/pre-deploy-*.sql.gz | tail -n +6 | xargs -r rm -f
  else
    rm -f "$SHARED/backups/pre-deploy-$TS.sql.gz"
    die "backup failed: not migrating without it"
  fi
fi

# 4) build and start; the entrypoint applies the migrations and creates the administrator once
log "docker compose build"
docker compose build
docker compose up -d --remove-orphans

# 5) health: the answer must come from Argano itself
for i in $(seq 1 40); do
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"app":"argano"'; then
    ok "healthy on 127.0.0.1:$PORT"
    break
  fi
  if [ "$i" = 40 ]; then
    docker compose logs --tail 60 app || true
    die "not healthy on 127.0.0.1:$PORT"
  fi
  sleep 3
done

# 6) nginx vhost and TLS certificate (ARGANO_TLS=0 or no nginx: skipped)
if [ "${ARGANO_TLS:-1}" = "1" ] && command -v nginx >/dev/null; then
  conf=/etc/nginx/sites-available/argano.conf
  install -d /var/www/certbot
  if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # HTTP only until the certificate exists: the ACME challenge must be reachable
    cat > "$conf" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
    ln -sf "$conf" /etc/nginx/sites-enabled/argano.conf
    nginx -t && systemctl reload nginx
    if command -v certbot >/dev/null && certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --non-interactive --agree-tos \
        -m "${CERTBOT_EMAIL:-admin@carbonstealth.eu}" --deploy-hook "systemctl reload nginx"; then
      ok "certificate issued for $DOMAIN"
    else
      warn "no certificate for $DOMAIN yet (DNS A record to this VPS? certbot installed?): HTTP only, run again later"
    fi
  fi
  if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    [ -f "$conf" ] && cp -a "$conf" "$conf.bak"
    sed -e "s/argano\.carbonstealth\.eu/$DOMAIN/g" -e "s/127\.0\.0\.1:4320/127.0.0.1:$PORT/" deploy/nginx/argano.conf > "$conf"
    ln -sf "$conf" /etc/nginx/sites-enabled/argano.conf
    if nginx -t; then
      systemctl reload nginx
      ok "nginx: https://$DOMAIN"
    else
      [ -f "$conf.bak" ] && mv "$conf.bak" "$conf"
      warn "the new nginx config is invalid: the previous one is back"
    fi
    renew="/etc/letsencrypt/renewal/$DOMAIN.conf"
    if [ -f "$renew" ] && ! grep -q '^renew_hook' "$renew"; then printf 'renew_hook = systemctl reload nginx\n' >> "$renew"; fi
  fi
fi
ok "deployed"
