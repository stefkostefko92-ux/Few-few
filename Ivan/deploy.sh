#!/usr/bin/env bash
# Деплой на Склад (sklad.carbonstealth.eu): копие в /var/www/sklad, TLS, nginx на хоста, Docker Compose.
# Идемпотентен. Тайните са само в /var/www/sklad/.env (mode 600) — създават се тук, ако липсват, и се сменят,
# ако са стойностите, които някога стояха в публичното репо.
set -euo pipefail

DOMAIN="sklad.carbonstealth.eu"
INSTALL_DIR="/var/www/sklad"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}"
ENV_FILE="${INSTALL_DIR}/.env"
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$INSTALL_DIR")}"
# SHA-256 на публичните стойности по подразбиране (стария docker-compose.yml) — пазим само отпечатъка.
PUBLIC_JWT_SHA="ff50154e3c81c813acaef4af4ce41f3b720c66fd2abc43ac7258630e5b16b3ae"
PUBLIC_DB_SHA="9b593c96985a34703dee839dcd392320648527723147da30d749b0c70e4ba86a"

echo "═══ СКЛАД АВТОЧАСТИ — Деплой ═══"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
    echo "📁 Копиране в ${INSTALL_DIR}..."
    mkdir -p "$INSTALL_DIR"
    cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR"/
    cp "$SCRIPT_DIR"/.gitignore "$INSTALL_DIR"/ 2>/dev/null || true
    # .env на сървъра е източникът — локален .env не го презаписва
    if [ -f "$SCRIPT_DIR/.env" ] && [ ! -f "$ENV_FILE" ]; then cp "$SCRIPT_DIR/.env" "$ENV_FILE"; fi
fi
cd "$INSTALL_DIR"

# ── Тайните ────────────────────────────────────────────────────────────────
sha() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
# стойността без обграждащи кавички (compose ги маха, затова и сравнението е без тях)
env_get() {
    grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -E "s/^\"(.*)\"$/\\1/; s/^'(.*)'$/\\1/" || true
}
env_set() {
    local tmp
    tmp="$(mktemp "${INSTALL_DIR}/.env.XXXXXX")"
    { grep -v -E "^$1=" "$ENV_FILE" 2>/dev/null || true; printf '%s=%s\n' "$1" "$2"; } > "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$ENV_FILE"
}
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

jwt="$(env_get JWT_SECRET)"
if [ "${#jwt}" -lt 32 ] || [ "$(sha "$jwt")" = "$PUBLIC_JWT_SHA" ]; then
    env_set JWT_SECRET "$(openssl rand -hex 32)"
    echo "🔑 Нов JWT_SECRET — старите сесии падат, всички влизат отново."
fi

db="$(env_get DB_PASSWORD)"
if [ -z "$db" ] || [ "$(sha "$db")" = "$PUBLIC_DB_SHA" ]; then
    new_db="$(openssl rand -hex 24)"
    if docker volume inspect "${PROJECT}_pgdata" >/dev/null 2>&1; then
        # Базата вече съществува с публичната парола: сменяме я вътре, после в .env.
        echo "🔑 Смяна на паролата на базата..."
        DB_PASSWORD="$new_db" JWT_SECRET="$(env_get JWT_SECRET)" docker compose -p "$PROJECT" up -d postgres
        for i in $(seq 1 30); do
            docker compose -p "$PROJECT" exec -T postgres pg_isready -U sklad_user -d sklad >/dev/null 2>&1 && break
            [ "$i" -eq 30 ] && { echo "❌ Базата не стана готова"; exit 1; }
            sleep 2
        done
        printf "ALTER USER sklad_user WITH PASSWORD '%s';\n" "$new_db" \
            | docker compose -p "$PROJECT" exec -T postgres psql -U sklad_user -d sklad -v ON_ERROR_STOP=1 -q
    fi
    env_set DB_PASSWORD "$new_db"
    echo "   ✅ DB_PASSWORD е в .env"
fi

# ── TLS и nginx на хоста ───────────────────────────────────────────────────
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
    certbot certonly --webroot -w /var/www/html -d "$DOMAIN" \
        --non-interactive --agree-tos -m admin@carbonstealth.eu
fi

echo "⚙️  Nginx..."
cp "$INSTALL_DIR/nginx-host.conf" "$NGINX_CONF"
ln -sf "$NGINX_CONF" "$NGINX_LINK"
nginx -t
systemctl reload nginx
echo "   ✅ OK"

# ── Docker ─────────────────────────────────────────────────────────────────
echo "🐳 Docker..."
docker compose -p "$PROJECT" down --remove-orphans 2>/dev/null || true
for PORT in 4100 4180; do
    PID="$(lsof -ti :"$PORT" 2>/dev/null || true)"
    if [ -n "$PID" ]; then kill -9 $PID 2>/dev/null || true; fi
done
docker compose -p "$PROJECT" build --no-cache backend
docker compose -p "$PROJECT" up -d

echo "⏳ Чакам..."
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:4100/api/health > /dev/null 2>&1; then
        echo "✅ Backend OK!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "❌ Timeout — docker compose -p $PROJECT logs backend"
        exit 1
    fi
    sleep 2
done
if curl -sf -o /dev/null "https://${DOMAIN}/api/health"; then
    echo "✅ https://${DOMAIN}/api/health — 200"
else
    echo "⚠️  https://${DOMAIN}/api/health не отговаря (DNS/TLS/nginx на хоста)"
fi

echo ""
echo "═══════════════════════════════════════"
echo "✅ https://${DOMAIN}"
echo "📂 ${INSTALL_DIR}"
echo "📋 cd $INSTALL_DIR && docker compose -p $PROJECT logs -f backend"
echo "═══════════════════════════════════════"
