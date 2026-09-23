#!/usr/bin/env bash
# Деплой на V.F.R. (статичен сайт) на VPS-а. Пуска се НА сървъра от разархивираната папка vfr/.
# Идемпотентен. При първи деплой: HTTP-only nginx → certbot webroot → пълен конфиг (кокошката и яйцето:
# пълният конфиг сочи сертификат, който още не съществува).
set -euo pipefail

DOMAIN="${DOMAIN:-vfr.carbonstealth.eu}"
# DOMAIN става път (/var/www/$DOMAIN) и отива в sed: `../../etc` би насочил `rsync --delete` към /etc,
# а `&` чупи sed. Приемаме само валидно DNS име.
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || { echo "✗ невалиден DOMAIN: $DOMAIN" >&2; exit 1; }
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Пише nginx конфиг атомарно и го проверява с `nginx -t`. При провал връща предишния конфиг (или
# маха новия), за да не остане счупен файл в sites-enabled — той би спрял nginx -t/reload/restart
# за ВСИЧКИ продукти на сървъра.
install_nginx_conf() {
  local src="$1" tmp
  tmp="$(mktemp)"
  cat "$src" > "$tmp"
  if sudo test -f "$NGINX_CONF"; then sudo cp -a "$NGINX_CONF" "$NGINX_CONF.bak"; else sudo rm -f "$NGINX_CONF.bak"; fi
  sudo install -m 644 -o root -g root "$tmp" "$NGINX_CONF"
  rm -f "$tmp"
  sudo ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
  if ! sudo nginx -t; then
    if sudo test -f "$NGINX_CONF.bak"; then
      sudo mv "$NGINX_CONF.bak" "$NGINX_CONF"
    else
      sudo rm -f "/etc/nginx/sites-enabled/$DOMAIN" "$NGINX_CONF"
    fi
    echo "✗ nginx -t падна — предишният конфиг е върнат, нищо не е презаредено" >&2
    exit 1
  fi
  sudo rm -f "$NGINX_CONF.bak"
  sudo systemctl reload nginx
}

echo "== V.F.R. → $DOMAIN"

echo "[1/5] Файлове → $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
# Allowlist: само публичното. photos.json е служебен (източници на снимките) — не се публикува.
# --no-links: симлинк от репото не влиза в уеб корена (nginx иначе би го последвал извън него).
# --delete-excluded: трие и стари файлове, които вече са изключени (иначе --delete ги оставя публикувани).
sudo rsync -a --no-links --delete --delete-excluded \
  --exclude='images/photos.json' \
  --include='index.html' --include='privacy.html' --include='404.html' \
  --include='robots.txt' --include='sitemap.xml' --include='llms.txt' --include='indexnow-key.txt' \
  --include='css/***' --include='js/***' --include='images/***' --include='fonts/***' --include='.well-known/***' \
  --exclude='*' "$SRC/" "$WEB_ROOT/"
# Собственик root: nginx worker-ът (www-data) само чете — при компрометиране не може да подмени съдържанието.
sudo chown -R root:root "$WEB_ROOT"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} + -o -type f -exec chmod 644 {} +

# `sudo test`: /etc/letsencrypt/live е 0700 root — без sudo проверката винаги „не намира“ сертификата.
if ! sudo test -f "$CERT"; then
  echo "[2/5] Няма сертификат — bootstrap (HTTP-only + webroot)"
  BOOT="$(mktemp)"
  printf 'server { listen 80; listen [::]:80; server_name %s; server_tokens off; root %s; }\n' "$DOMAIN" "$WEB_ROOT" > "$BOOT"
  install_nginx_conf "$BOOT"
  rm -f "$BOOT"
  sudo certbot certonly --webroot -w "$WEB_ROOT" -d "$DOMAIN" --non-interactive --agree-tos --email admin@carbonstealth.eu
else
  echo "[2/5] Сертификатът съществува"
fi

echo "[3/5] Nginx конфиг"
CONF="$(mktemp)"
sed "s/vfr\.carbonstealth\.eu/$DOMAIN/g" "$SRC/nginx.conf" > "$CONF"

echo "[4/5] nginx -t + reload (с връщане при провал)"
install_nginx_conf "$CONF"
rm -f "$CONF"

echo "[5/5] Проверка"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/")"
if [ "$CODE" = "200" ]; then
  echo "✓ https://$DOMAIN/ → 200"
  echo "  IndexNow: node tools/seo/indexnow.mjs https://$DOMAIN (от репото)"
else
  echo "✗ HTTP $CODE — виж /var/log/nginx/vfr.error.log" >&2
  exit 1
fi
