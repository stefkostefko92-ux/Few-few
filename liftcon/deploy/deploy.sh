#!/usr/bin/env bash
# LiftCon — деплой на VPS-а (netcup). Пуска се НА сървъра от разархивирания release (папката liftcon/):
#   sudo DOMAIN=liftcon.it bash liftcon/deploy/deploy.sh
# Идемпотентен: бекъп на базата и на сайта → базова версия на сайта от репото → база + приложение (Docker;
# приложението прилага миграциите и публикува сайта с промените от панела) → Nginx → проверки.
# При провал всичко се връща: сайтът (връзката current), Nginx конфигът и образът на приложението.
# Тайните са в $STATE/.env (mode 600), не в архива.
set -euo pipefail

DOMAIN="${DOMAIN:-liftcon.it}"
PORT="${LIFTCON_HTTP_PORT:-4370}"
STATE="${LIFTCON_STATE_DIR:-/opt/few-few/shared/liftcon}"
ENV_FILE="$STATE/.env"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
SNIPPET="/etc/nginx/snippets/liftcon-headers.conf"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(dirname "$HERE")"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
NODE_UID=1000 # потребителят node в образа

log() { printf '[liftcon] %s\n' "$*"; }
die() { printf '[liftcon] ГРЕШКА: %s\n' "$*" >&2; exit 1; }
compose() { LIFTCON_ENV_FILE="$ENV_FILE" LIFTCON_HTTP_PORT="$PORT" LIFTCON_SITE_DIR="$WEB_ROOT" docker compose --env-file "$ENV_FILE" -f "$APP/docker-compose.yml" -p liftcon "$@"; }

[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "невалиден DOMAIN: $DOMAIN"
for c in nginx docker curl certbot ss tar gzip; do command -v "$c" >/dev/null || die "липсва командата $c"; done
[[ -f "$APP/public/index.html" ]] || die "няма $APP/public/index.html — грешен архив?"
[[ -f "$ENV_FILE" ]] || die "липсва $ENV_FILE (виж server/.env.example)"
[[ "$(stat -c %a "$ENV_FILE")" == "600" ]] || die "$ENV_FILE трябва да е с права 600"
# Brevo (ключ, подател, получател) може да е тук или да се настрои от панела: /admin/impostazioni.
for k in POSTGRES_PASSWORD JWT_SECRET SEAL_KEY ADMIN_EMAIL; do
  grep -qE "^$k=.+" "$ENV_FILE" || die "в $ENV_FILE липсва $k"
done

# Портът: свободен или вече държан от нашия контейнер.
if ss -tlnH "sport = :$PORT" | grep -q .; then
  docker ps --format '{{.Names}} {{.Ports}}' | grep -q "^liftcon-api .*127.0.0.1:$PORT->" || die "порт $PORT е зает от друг процес"
fi

mkdir -p "$STATE/backup" "$WEB_ROOT/releases"
chmod 700 "$STATE"

# 1. Бекъп на базата (преди миграциите) и запомняне на активната версия на сайта.
if docker ps --format '{{.Names}}' | grep -q '^liftcon-db-1$'; then
  compose exec -T db pg_dump -U liftcon -d liftcon --no-owner | gzip >"$STATE/backup/db-$TS.sql.gz"
  log "бекъп на базата: $STATE/backup/db-$TS.sql.gz"
fi
ls -1t "$STATE"/backup/db-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f || true
PREV_TARGET="$(readlink "$WEB_ROOT/current" 2>/dev/null || true)"

rollback() {
  if [[ -n "$PREV_TARGET" ]]; then
    ln -sfn "$PREV_TARGET" "$WEB_ROOT/current.tmp" && mv -Tf "$WEB_ROOT/current.tmp" "$WEB_ROOT/current"
    log "ОТКАТ: сайтът сочи пак $PREV_TARGET"
  fi
  if [[ -f "$NGINX_CONF.prev" ]]; then mv -f "$NGINX_CONF.prev" "$NGINX_CONF"; fi
  if [[ -f "$SNIPPET.prev" ]]; then mv -f "$SNIPPET.prev" "$SNIPPET"; fi
  if docker image inspect liftcon-api:prev >/dev/null 2>&1; then
    docker tag liftcon-api:prev liftcon-api:latest
    compose up -d --no-build api || true
    log "ОТКАТ: приложението е върнато към предишния образ (базата: бекъпът е в $STATE/backup)"
  fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
}

# 2. Базовата версия на сайта от репото (ако приложението не тръгне, сайтът пак е жив и актуален).
cp -a "$APP/public" "$WEB_ROOT/releases/repo-$TS"
ln -sfn "releases/repo-$TS" "$WEB_ROOT/current.tmp" && mv -Tf "$WEB_ROOT/current.tmp" "$WEB_ROOT/current"
# Приложението (потребител node) пише нови версии; Nginx (www-data) само чете.
chown -R "$NODE_UID:$NODE_UID" "$WEB_ROOT"
find "$WEB_ROOT" -type d -exec chmod 755 {} + && find "$WEB_ROOT" -type f -exec chmod 644 {} +
log "базова версия: $WEB_ROOT/releases/repo-$TS"
trap 'rollback; die "деплоят спря на ред $LINENO — върнато е предишното състояние"' ERR

# 3. База + приложение (предишният образ се пази като :prev). Приложението прилага `migrate deploy` при старт
#    и публикува сайта с промените от панела в нова версия.
if docker image inspect liftcon-api:latest >/dev/null 2>&1; then docker tag liftcon-api:latest liftcon-api:prev; fi
compose up -d --build
log "база и приложение пуснати (127.0.0.1:$PORT)"

# 4. Сертификат (първи деплой: временен HTTP конфиг → webroot → пълният конфиг).
if [[ ! -f "$CERT" ]]; then
  log "няма сертификат — временен HTTP конфиг и certbot"
  cat >"$NGINX_CONF" <<CONF
server { listen 80; listen [::]:80; server_name $DOMAIN www.$DOMAIN; root $WEB_ROOT/current; }
CONF
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
  nginx -t && systemctl reload nginx
  if ! certbot certonly --webroot -w "$WEB_ROOT/current" -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email admin@carbonstealth.eu; then
    rm -f "/etc/nginx/sites-enabled/$DOMAIN" "$NGINX_CONF"
    systemctl reload nginx
    trap - ERR
    die "certbot не издаде сертификат (DNS на $DOMAIN сочи ли към сървъра?) — временният HTTP конфиг е махнат"
  fi
fi

# 5. Пълният Nginx конфиг. Старите файлове се пазят като .prev: ако `nginx -t` падне, trap-ът ги връща.
if [[ -f "$SNIPPET" ]]; then cp -a "$SNIPPET" "$SNIPPET.prev"; fi
if [[ -f "$NGINX_CONF" ]]; then cp -a "$NGINX_CONF" "$NGINX_CONF.prev"; fi
install -m 644 "$HERE/liftcon-headers.conf" "$SNIPPET"
sed -e "s/liftcon\.it/$DOMAIN/g" -e "s/127\.0\.0\.1:4370/127.0.0.1:$PORT/g" "$HERE/nginx.conf" >"$NGINX_CONF.new"
mv "$NGINX_CONF.new" "$NGINX_CONF"
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t
systemctl reload nginx

# 6. Проверки: приложението, /health и /admin през Nginx, началната страница. Провал → откат.
ok=0
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null && curl -fsS "https://$DOMAIN/health" >/dev/null \
    && curl -fsS -o /dev/null "https://$DOMAIN/" && curl -fsS -o /dev/null "https://$DOMAIN/admin/login"; then ok=1; break; fi
  sleep 3
done
if [[ "$ok" != 1 ]]; then trap - ERR; rollback; die "проверката на здравето не мина — върнато е предишното състояние"; fi
trap - ERR
rm -f "$NGINX_CONF.prev" "$SNIPPET.prev"
# Старите версии на сайта: пазят се последните 5 (освен активната).
active="$(readlink "$WEB_ROOT/current")"
ls -1dt "$WEB_ROOT"/releases/* 2>/dev/null | grep -v "/${active#releases/}$" | tail -n +6 | xargs -r rm -rf || true
log "health 200: https://$DOMAIN/health, https://$DOMAIN/ и https://$DOMAIN/admin/login (активна версия: $active)"

# 7. IndexNow (Bing, Yandex, Seznam, Naver, Yep) — по желание: INDEXNOW=1.
if [[ "${INDEXNOW:-0}" == "1" && -f "$APP/../tools/seo/indexnow.mjs" ]]; then
  node "$APP/../tools/seo/indexnow.mjs" "https://$DOMAIN" || log "IndexNow не мина (сайтът е жив; пуснете го ръчно)"
fi
log "готово"
