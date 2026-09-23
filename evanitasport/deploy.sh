#!/usr/bin/env bash
# Deploy Evanita Sport to VPS
# Run this ON the VPS from the unpacked evanitasport/ folder (път без значение — скриптът
# намира файловете спрямо себе си).
#
# Ред на стъпките (важно): пълният nginx конфиг сочи сертификата на Let's
# Encrypt → не може да се инсталира ПРЕДИ сертификатът да съществува (nginx -t
# пада с "cannot load certificate", а certbot-ът, който ползва nginx, пада
# заедно с него — кокошката и яйцето). Затова при първи деплой: временен
# HTTP-only конфиг → сертификат през webroot → чак тогава пълният конфиг.

set -euo pipefail

DOMAIN="evanita-bg.com"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v rsync >/dev/null || { echo "✗ липсва rsync: sudo apt-get install -y rsync" >&2; exit 1; }

# Пише nginx конфиг атомарно и го проверява с `nginx -t`. При провал връща предишния конфиг (или
# маха новия), за да не остане счупен файл в sites-enabled — той би спрял nginx -t/reload/restart
# за ВСИЧКИ сайтове на сървъра.
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

echo "═══════════════════════════════════════════"
echo "  Deploying Evanita Sport"
echo "  Domain: $DOMAIN"
echo "═══════════════════════════════════════════"

# 1. Web root — само публичните файлове (allowlist).
#    --no-links: симлинк от репото не влиза в уеб корена (nginx иначе би го последвал извън него).
#    --delete --delete-excluded: уеб коренът става ТОЧНО allowlist-ът; стари и служебни файлове
#    не остават публикувани. Изтритото се показва (--info=DEL1) — ако на сървъра е имало ръчно
#    качен файл (напр. верификация за Google), той се вижда тук и трябва да влезе в репото.
echo "[1/5] Files → $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --no-links --delete --delete-excluded --info=DEL1 \
  --include='index.html' --include='404.html' --include='favicon.svg' --include='apple-touch-icon.png' \
  --include='robots.txt' --include='sitemap.xml' --include='llms.txt' --include='indexnow-key.txt' \
  --include='css/***' --include='js/***' --include='images/***' --include='.well-known/***' \
  --exclude='*' "$SRC/" "$WEB_ROOT/"
# Собственик root: nginx worker-ът (www-data) само чете — при компрометиране не може да подмени
# съдържанието. Файлове 644 (не 755 — не са изпълними), папки 755.
sudo chown -R root:root "$WEB_ROOT"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} + -o -type f -exec chmod 644 {} +

# 2. SSL certificate (bootstrap при първи деплой).
#    `sudo test`: /etc/letsencrypt/live е 0700 root — без sudo проверката винаги „не намира“
#    сертификата и пуска bootstrap-а, който за миг сваля сайта на голо HTTP.
if ! sudo test -f "$CERT"; then
  echo "[2/5] No certificate yet — bootstrapping (HTTP-only nginx + webroot)..."
  BOOT="$(mktemp)"
  printf 'server { listen 80; server_name %s www.%s; server_tokens off; root %s; }\n' "$DOMAIN" "$DOMAIN" "$WEB_ROOT" > "$BOOT"
  install_nginx_conf "$BOOT"
  rm -f "$BOOT"
  sudo certbot certonly --webroot -w "$WEB_ROOT" -d "$DOMAIN" -d "www.$DOMAIN" \
    --non-interactive --agree-tos --email admin@carbonstealth.eu
else
  echo "[2/5] Certificate exists — skipping bootstrap."
fi

# 3–4. Пълният nginx конфиг: nginx -t + reload, с връщане на предишния при провал.
echo "[3/5] Installing nginx config (nginx -t, rollback on failure)..."
install_nginx_conf "$SRC/nginx.conf"
echo "[4/5] nginx reloaded."

# 5. Verify
echo "[5/5] Verifying..."
HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/")"
if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  ✓ DEPLOYED SUCCESSFULLY"
  echo "  https://$DOMAIN"
  echo "═══════════════════════════════════════════"
else
  echo ""
  echo "  ✗ HTTP $HTTP_CODE — check nginx error log" >&2
  echo "  sudo tail -20 /var/log/nginx/evanita.error.log" >&2
  exit 1
fi
