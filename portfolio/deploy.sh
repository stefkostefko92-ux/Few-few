#!/usr/bin/env bash
# deploy.sh — деплой на портфолиото на VPS-а (Nginx, статични файлове). Пуска се НА сървъра от
# папката portfolio/ на разархивирания GitHub архив:
#   sudo bash portfolio/deploy.sh
# Идемпотентен: билд → атомарна смяна на web root-а → (сертификат при първи път) → nginx reload → health
# → контактният API (systemd, само ако тайните са на сървъра — api/README.md).
# Nginx конфигът е ФАЙЛ в репото (nginx.conf), не се пише на ръка на сървъра.
set -euo pipefail

DOMAIN="portfolio.carbonstealth.eu"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "══ Carbon Stealth Portfolio → https://$DOMAIN"

# 1. Билд (нула зависимости; Node ≥20 е на машината заради другите продукти).
#    Снимки на проекти, заснети НА сървъра (tools/project-shots.mjs --live --out $SHOTS_PERSIST), живеят в
#    постоянна папка и се наливат преди билда — иначе новият архив ги губи. Репото има предимство (-n).
SHOTS_PERSIST="/opt/portfolio/img-projects"
if [ -d "$SHOTS_PERSIST" ] && ls "$SHOTS_PERSIST"/*.webp >/dev/null 2>&1; then
  mkdir -p "$HERE/public/img/projects"
  cp -n "$SHOTS_PERSIST"/*.webp "$HERE/public/img/projects/"
  echo "[1/7] Снимки на проекти от $SHOTS_PERSIST: $(ls "$SHOTS_PERSIST"/*.webp | wc -l) файла"
fi
echo "[1/7] Билд…"
( cd "$HERE" && node build.mjs )

# 2. Атомарна смяна: нов root до стария, после mv (нула секунди без сайт)
echo "[2/7] Публикуване на файловете…"
mkdir -p "$WEB_ROOT.new"
cp -r "$HERE/dist/." "$WEB_ROOT.new/"
chown -R www-data:www-data "$WEB_ROOT.new"
chmod -R 755 "$WEB_ROOT.new"
if [ -d "$WEB_ROOT" ]; then rm -rf "$WEB_ROOT.prev"; mv "$WEB_ROOT" "$WEB_ROOT.prev"; fi
mv "$WEB_ROOT.new" "$WEB_ROOT"

# 3. Сертификат при първи деплой (кокошката и яйцето: пълният конфиг сочи сертификата → първо HTTP-only)
if [ ! -f "$CERT" ]; then
  echo "[3/7] Няма сертификат — bootstrap през webroot…"
  cat > "$NGINX_CONF" <<NG
server { listen 80; server_name $DOMAIN; root $WEB_ROOT; }
NG
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w "$WEB_ROOT" -d "$DOMAIN" --non-interactive --agree-tos --email admin@carbonstealth.eu
else
  echo "[3/7] Сертификатът съществува."
fi

# 4. Пълният конфиг от репото
echo "[4/7] Nginx конфиг…"
cp "$HERE/nginx.conf" "$NGINX_CONF"
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t

# 5. Reload
echo "[5/7] Reload…"
systemctl reload nginx

# 6. Health: и трите езика трябва да отговарят 200
echo "[6/7] Проверка…"
for p in /bg/ /en/ /it/; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN$p")"
  if [ "$code" != "200" ]; then
    echo "✗ $p → HTTP $code — връщам предишната версия"
    if [ -d "$WEB_ROOT.prev" ]; then rm -rf "$WEB_ROOT"; mv "$WEB_ROOT.prev" "$WEB_ROOT"; systemctl reload nginx; fi
    exit 1
  fi
done
echo "✓ Живо: https://$DOMAIN (bg · en · it)"

# 7. Контактният API — Node на 127.0.0.1:4187 зад Nginx. Тайните са САМО на сървъра в $API_ENV
#    (root, mode 600: BREVO_API_KEY · CONTACT_TO · CONTACT_FROM). Без него сайтът работи, формата пада на mailto.
echo "[7/7] Контактен API…"
API_ENV="/etc/portfolio-api.env"
API_DIR="/opt/portfolio-api"
if [ ! -f "$API_ENV" ]; then
  echo "  ⚠ Липсва $API_ENV — API-то не се пуска. Създай го по portfolio/api/README.md и пусни деплоя пак."
else
  chmod 600 "$API_ENV"
  install -d -o www-data -g www-data -m 755 "$API_DIR"
  install -o www-data -g www-data -m 644 "$HERE/api/server.mjs" "$API_DIR/server.mjs"
  install -m 644 "$HERE/deploy/portfolio-api.service" /etc/systemd/system/portfolio-api.service
  systemctl daemon-reload
  systemctl enable portfolio-api >/dev/null 2>&1 || true
  systemctl restart portfolio-api
  sleep 1
  hc="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:4187/api/health")"
  if [ "$hc" != "200" ]; then
    echo "  ✗ API health → HTTP $hc"; journalctl -u portfolio-api -n 20 --no-pager; exit 1
  fi
  echo "  ✓ API health 200 (https://$DOMAIN/api/health)"
fi
# IndexNow (Bing/Yandex/Seznam/Naver/Yep) — Google не поддържа; за него sitemap-ът е свеж.
if [ -f "$HERE/../tools/seo/indexnow.mjs" ]; then node "$HERE/../tools/seo/indexnow.mjs" "https://$DOMAIN" || echo "(IndexNow пропуснат)"; fi
