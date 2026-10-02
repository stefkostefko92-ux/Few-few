#!/usr/bin/env bash
# LiftPilot on the VPS: secrets (first time only), backup before the migrations, Docker Compose build and start,
# health with the application marker, nginx vhost and Let's Encrypt certificate. Idempotent. Run as root from the
# liftpilot/ directory of a release (deploy/autodeploy.sh does it for PROJECTS containing "liftpilot"):
#   sudo bash deploy/deploy.sh
# Env (all optional):
#   LIFTPILOT_ENV             the server's secrets (default /opt/few-few/shared/liftpilot/.env)
#   LIFTPILOT_ADMIN_PASSWORD  password of admin@carbonstealth.eu for its creation (random when absent); taken out of
#                             the secrets file once the application is healthy (the account exists by then)
#   LIFTPILOT_SMTP_USER, LIFTPILOT_SMTP_PASS  Brevo SMTP login and key: registration and forgotten password send e-mail
#   LIFTPILOT_MAIL_FROM       sender (default "LiftPilot <noreply@carbonstealth.eu>", a sender verified in Brevo)
#   LIFTPILOT_STRIPE_SECRET_KEY, LIFTPILOT_STRIPE_WEBHOOK_SECRET, LIFTPILOT_STRIPE_PRICE_MONTHLY,
#   LIFTPILOT_STRIPE_PRODUCT_SEATS  the subscription (all four, or billing stays off); LIFTPILOT_STRIPE_AUTOMATIC_TAX
#                             (true|false), LIFTPILOT_BILLING_TRIAL_DAYS (default 14)
#   LIFTPILOT_TLS=0           leave nginx and certbot alone; CERTBOT_EMAIL (default admin@carbonstealth.eu)
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${LIFTPILOT_ENV:-/opt/few-few/shared/liftpilot/.env}"
SHARED="$(dirname "$ENV_FILE")"
TS="$(date -u +%Y%m%d-%H%M%S)"
log()  { printf '\033[1;36m▸ liftpilot: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ liftpilot: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ liftpilot: %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✘ liftpilot: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "run as root (sudo)"
command -v docker >/dev/null || die "docker is missing (Docker Engine + compose plugin)"
rand() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

env_get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
# KEY=value replaces the key's line or is appended; the file stays 600 at every step
env_put() {
  local tmp
  tmp="$(mktemp "$SHARED/.env.XXXXXX")"
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}
env_default() { grep -qE "^$1=" "$ENV_FILE" || env_put "$1" "$2"; }
# KEY='value': single quotes keep a secret literal for Docker Compose (no $ interpolation). Checked here, in the
# script's own shell (never inside $(…), where die would end only a subshell): a quote or a new line stops the deploy.
q_ok() { case "$2" in *"'"* | *$'\n'*) die "$1: a value with a quote or a new line cannot go into $ENV_FILE";; esac; }
env_put_q() { q_ok "$1" "$2"; env_put "$1" "'$2'"; }

# 1) secrets live on the server only; created once, then only what is given here changes
install -d -m 700 "$SHARED"
if [ ! -f "$ENV_FILE" ]; then
  (
    umask 077
    cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(rand 32)
AUTH_SECRET=$(rand 48)
APP_PORT=4320
PUBLIC_BASE_URL=https://liftpilot.carbonstealth.eu
ALLOW_INDEXING=false
LOG_LEVEL=info
ADMIN_EMAIL=admin@carbonstealth.eu
ADMIN_NAME=Carbon Stealth VCC
ADMIN_COMPANY=Carbon Stealth VCC
EOF
  )
  if [ -z "${LIFTPILOT_ADMIN_PASSWORD:-}" ]; then
    admin_pw="$(rand 20)"
    env_put ADMIN_PASSWORD "$admin_pw"
    warn "created $ENV_FILE — administrator admin@carbonstealth.eu, password: ${admin_pw}"
    warn "store it in the password manager now: it is shown only this once"
  else
    ok "created $ENV_FILE"
  fi
fi
chmod 600 "$ENV_FILE"
if [ -n "${LIFTPILOT_ADMIN_PASSWORD:-}" ]; then env_put_q ADMIN_PASSWORD "$LIFTPILOT_ADMIN_PASSWORD"; fi
# mail: Brevo's relay on 2525 (the VPS provider blocks 25/465/587); the host is written only with a login, so that
# without one the application keeps registration and forgotten password closed instead of failing to send
env_default SMTP_PORT 2525
env_default SMTP_SECURE false
if [ -n "${LIFTPILOT_MAIL_FROM:-}" ] || ! grep -qE '^MAIL_FROM=' "$ENV_FILE"; then
  env_put_q MAIL_FROM "${LIFTPILOT_MAIL_FROM:-LiftPilot <noreply@carbonstealth.eu>}"
fi
if [ -n "${LIFTPILOT_SMTP_USER:-}" ] && [ -n "${LIFTPILOT_SMTP_PASS:-}" ]; then
  q_ok SMTP_USER "$LIFTPILOT_SMTP_USER"
  q_ok SMTP_PASS "$LIFTPILOT_SMTP_PASS"
  env_put_q SMTP_USER "$LIFTPILOT_SMTP_USER"
  env_put_q SMTP_PASS "$LIFTPILOT_SMTP_PASS"
  env_default SMTP_HOST smtp-relay.brevo.com
fi
if [ -z "$(env_get SMTP_HOST)" ] || [ -z "$(env_get SMTP_USER)" ] || [ -z "$(env_get SMTP_PASS)" ]; then
  warn "no mail settings in $ENV_FILE: registration and forgotten password stay closed (give LIFTPILOT_SMTP_USER and LIFTPILOT_SMTP_PASS)"
fi
# the subscription: Stripe's values are written only when given; without all four, billing stays off
for k in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_MONTHLY STRIPE_PRODUCT_SEATS; do
  v="LIFTPILOT_$k"
  if [ -n "${!v:-}" ]; then env_put_q "$k" "${!v}"; fi
done
case "${LIFTPILOT_STRIPE_AUTOMATIC_TAX:-}" in true|false) env_put STRIPE_AUTOMATIC_TAX "$LIFTPILOT_STRIPE_AUTOMATIC_TAX";; '') ;; *) die "LIFTPILOT_STRIPE_AUTOMATIC_TAX: true or false";; esac
if [ -n "${LIFTPILOT_BILLING_TRIAL_DAYS:-}" ]; then
  case "$LIFTPILOT_BILLING_TRIAL_DAYS" in *[!0-9]*) die "LIFTPILOT_BILLING_TRIAL_DAYS: whole days";; esac
  env_put BILLING_TRIAL_DAYS "$LIFTPILOT_BILLING_TRIAL_DAYS"
fi
if [ -z "$(env_get STRIPE_SECRET_KEY)" ] || [ -z "$(env_get STRIPE_WEBHOOK_SECRET)" ] || [ -z "$(env_get STRIPE_PRICE_MONTHLY)" ] || [ -z "$(env_get STRIPE_PRODUCT_SEATS)" ]; then
  warn "no Stripe settings in $ENV_FILE: the subscription stays off and every company works without limits"
fi
PORT="$(env_get APP_PORT | tr -dc '0-9' || true)"
PORT="${PORT:-4320}"
DOMAIN="$(env_get PUBLIC_BASE_URL | sed -E 's#^https?://##; s#[/:].*$##' || true)"
DOMAIN="${DOMAIN:-liftpilot.carbonstealth.eu}"
install -m 600 "$ENV_FILE" .env

# 2) on the first start the port must be free: another project may already hold it
if [ -z "$(docker compose ps -q app 2>/dev/null || true)" ] && ss -Htln "sport = :$PORT" | grep -q .; then
  [ -f /opt/few-few/shared/argano/.env ] && warn "an earlier deployment under the old name (argano) may hold it: docker ps"
  die "port $PORT is already in use (ss -tlnp): set another APP_PORT in $ENV_FILE"
fi

# 3) backup before the migrations when the database already runs: no backup, no migration
if [ -n "$(docker compose ps -q db 2>/dev/null || true)" ]; then
  install -d -m 700 "$SHARED/backups"
  if docker compose exec -T db pg_dump -U liftpilot liftpilot | gzip > "$SHARED/backups/pre-deploy-$TS.sql.gz"; then
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

# 5) health: the answer must come from LiftPilot itself
wait_healthy() {
  local i
  for i in $(seq 1 40); do
    if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"app":"liftpilot"'; then
      ok "healthy on 127.0.0.1:$PORT"
      return 0
    fi
    sleep 3
  done
  docker compose logs --tail 60 app || true
  die "not healthy on 127.0.0.1:$PORT"
}
wait_healthy
# the administrator exists now (the entrypoint stops the start when it cannot create it): its password leaves the
# secrets file, and the container is made again without it (a running container keeps the environment it began with)
if [ -n "$(env_get ADMIN_PASSWORD)" ]; then
  env_put ADMIN_PASSWORD ""
  install -m 600 "$ENV_FILE" .env
  docker compose up -d app
  wait_healthy
  ok "administrator ready; ADMIN_PASSWORD gone from $ENV_FILE and from the container"
fi

# 6) nginx vhost and TLS certificate (LIFTPILOT_TLS=0 or no nginx: skipped)
if [ "${LIFTPILOT_TLS:-1}" = "1" ] && command -v nginx >/dev/null; then
  conf=/etc/nginx/sites-available/liftpilot.conf
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
    ln -sf "$conf" /etc/nginx/sites-enabled/liftpilot.conf
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
    sed -e "s/liftpilot\.carbonstealth\.eu/$DOMAIN/g" -e "s/127\.0\.0\.1:4320/127.0.0.1:$PORT/" deploy/nginx/liftpilot.conf > "$conf"
    ln -sf "$conf" /etc/nginx/sites-enabled/liftpilot.conf
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
