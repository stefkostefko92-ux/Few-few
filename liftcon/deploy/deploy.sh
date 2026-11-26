#!/usr/bin/env bash
# LiftCon — деплой на VPS-а. Пуска се НА сървъра от разархивирания release (папката liftcon/):
#   sudo DOMAIN=liftcom.it bash liftcon/deploy/deploy.sh
# Идемпотентен: бекъп на предишния уеб корен → нов сайт атомарно → бекенд (Docker) → Nginx → проверки;
# при провал на проверките сайтът се връща към бекъпа. Тайните са в $STATE/.env (mode 600), не в архива.
set -euo pipefail

DOMAIN="${DOMAIN:-liftcom.it}"
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

log() { printf '[liftcon] %s\n' "$*"; }
die() { printf '[liftcon] ГРЕШКА: %s\n' "$*" >&2; exit 1; }

[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "невалиден DOMAIN: $DOMAIN"
for c in nginx docker curl certbot ss tar; do command -v "$c" >/dev/null || die "липсва командата $c"; done
[[ -f "$APP/public/index.html" ]] || die "няма $APP/public/index.html — грешен архив?"
[[ -f "$ENV_FILE" ]] || die "липсва $ENV_FILE (виж server/.env.example)"
[[ "$(stat -c %a "$ENV_FILE")" == "600" ]] || die "$ENV_FILE трябва да е с права 600"

# Портът: свободен или вече държан от нашия контейнер.
if ss -tlnH "sport = :$PORT" | grep -q .; then
  docker ps --format '{{.Names}} {{.Ports}}' | grep -q "^liftcon-api .*127.0.0.1:$PORT->" || die "порт $PORT е зает от друг процес"
fi

# 1. Бекъп на текущия сайт (за отката) — пазят се последните 5.
mkdir -p "$STATE/backup"
chmod 700 "$STATE"
if [[ -d "$WEB_ROOT" ]]; then
  tar -czf "$STATE/backup/web-$TS.tar.gz" -C "$(dirname "$WEB_ROOT")" "$(basename "$WEB_ROOT")"
  log "бекъп: $STATE/backup/web-$TS.tar.gz"
fi
ls -1t "$STATE"/backup/web-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f || true

rollback() {
  local last
  last="$(ls -1t "$STATE"/backup/web-*.tar.gz 2>/dev/null | head -n 1 || true)"
  if [[ -n "$last" ]]; then
    rm -rf "$WEB_ROOT" && tar -xzf "$last" -C "$(dirname "$WEB_ROOT")"
    log "ОТКАТ: сайтът е върнат от $last"
  fi
  if [[ -f "$NGINX_CONF.prev" ]]; then mv -f "$NGINX_CONF.prev" "$NGINX_CONF"; fi
  if [[ -f "$SNIPPET.prev" ]]; then mv -f "$SNIPPET.prev" "$SNIPPET"; fi
  if docker image inspect liftcon-api:prev >/dev/null 2>&1; then
    docker tag liftcon-api:prev liftcon-api:latest
    LIFTCON_ENV_FILE="$ENV_FILE" LIFTCON_HTTP_PORT="$PORT" docker compose -f "$APP/docker-compose.yml" -p liftcon up -d --no-build || true
    log "ОТКАТ: бекендът е върнат към предишния образ"
  fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
}

# 2. Новият сайт — атомарна смяна на папката.
rm -rf "$WEB_ROOT.new"
cp -a "$APP/public" "$WEB_ROOT.new"
chown -R www-data:www-data "$WEB_ROOT.new"
find "$WEB_ROOT.new" -type d -exec chmod 755 {} + && find "$WEB_ROOT.new" -type f -exec chmod 644 {} +
if [[ -d "$WEB_ROOT" ]]; then mv "$WEB_ROOT" "$WEB_ROOT.old"; fi
mv "$WEB_ROOT.new" "$WEB_ROOT"
rm -rf "$WEB_ROOT.old"
log "сайтът е в $WEB_ROOT"
# От тук всяка грешка връща предишното състояние (сайт, Nginx конфиг, образ на бекенда).
trap 'rollback; die "деплоят спря на ред $LINENO — върнато е предишното състояние"' ERR

# 3. Бекендът на формата (предишният образ се пази като :prev за отката).
if docker image inspect liftcon-api:latest >/dev/null 2>&1; then docker tag liftcon-api:latest liftcon-api:prev; fi
LIFTCON_ENV_FILE="$ENV_FILE" LIFTCON_HTTP_PORT="$PORT" docker compose -f "$APP/docker-compose.yml" -p liftcon up -d --build
log "бекендът е пуснат (127.0.0.1:$PORT)"

# 4. Сертификат (първи деплой: временен HTTP конфиг → webroot → после пълният конфиг).
if [[ ! -f "$CERT" ]]; then
  log "няма сертификат — временен HTTP конфиг и certbot"
  cat >"$NGINX_CONF" <<CONF
server { listen 80; listen [::]:80; server_name $DOMAIN www.$DOMAIN; root $WEB_ROOT; }
CONF
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
  nginx -t && systemctl reload nginx
  if ! certbot certonly --webroot -w "$WEB_ROOT" -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email admin@carbonstealth.eu; then
    rm -f "/etc/nginx/sites-enabled/$DOMAIN" "$NGINX_CONF"
    systemctl reload nginx
    trap - ERR
    die "certbot не издаде сертификат (DNS сочи ли към сървъра?) — временният HTTP конфиг е махнат"
  fi
fi

# 5. Пълният Nginx конфиг (домейнът и портът — от променливите).
# Старите файлове се пазят като .prev: ако `nginx -t` падне, trap-ът ги връща преди някой reload.
if [[ -f "$SNIPPET" ]]; then cp -a "$SNIPPET" "$SNIPPET.prev"; fi
if [[ -f "$NGINX_CONF" ]]; then cp -a "$NGINX_CONF" "$NGINX_CONF.prev"; fi
install -m 644 "$HERE/liftcon-headers.conf" "$SNIPPET"
sed -e "s/liftcom\.it/$DOMAIN/g" -e "s/127\.0\.0\.1:4370/127.0.0.1:$PORT/g" "$HERE/nginx.conf" >"$NGINX_CONF.new"
mv "$NGINX_CONF.new" "$NGINX_CONF"
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t
systemctl reload nginx

# 6. Проверки: бекенд, /health през Nginx, началната страница. Провал → откат на сайта.
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null && curl -fsS "https://$DOMAIN/health" >/dev/null && curl -fsS -o /dev/null "https://$DOMAIN/"; then ok=1; break; fi
  sleep 3
done
if [[ "$ok" != 1 ]]; then trap - ERR; rollback; die "проверката на здравето не мина — върнато е предишното състояние"; fi
trap - ERR
rm -f "$NGINX_CONF.prev" "$SNIPPET.prev"
log "health 200: https://$DOMAIN/health и https://$DOMAIN/"

# 7. IndexNow (Bing, Yandex, Seznam, Naver, Yep) — по желание: INDEXNOW=1.
if [[ "${INDEXNOW:-0}" == "1" && -f "$APP/../tools/seo/indexnow.mjs" ]]; then
  node "$APP/../tools/seo/indexnow.mjs" "https://$DOMAIN" || log "IndexNow не мина (сайтът е жив; пуснете го ръчно)"
fi
log "готово"
