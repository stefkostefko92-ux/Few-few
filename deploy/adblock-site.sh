#!/usr/bin/env bash
# adblock-site.sh — самостоятелен деплой САМО на adblock.carbonstealth.eu сайта.
# По-лек от пълния autodeploy: обновява витрината от най-новия качен Few-few ZIP.
#
# Употреба (като root):
#   1) Качи най-новия Few-few ZIP в /root (Code → Download ZIP от GitHub).
#   2) sudo bash /root/adblock-site.sh
#   (или конкретен архив):  sudo ARCHIVE=/root/Few-few-main.zip bash /root/adblock-site.sh
#
# Идемпотентен: безопасно е да се пуска многократно. Не пипа други проекти.
set -euo pipefail

WWW="${ADBLOCK_WWW:-/var/www/adblock}"
DOMAIN="${ADBLOCK_DOMAIN:-adblock.carbonstealth.eu}"
KEY="${ADBLOCK_SIGNING_KEY:-/etc/caddy/adblock-signing.key}"
NSITE="/etc/nginx/sites-available/adblock.conf"

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Пусни като root (sudo)."
command -v unzip >/dev/null || { apt-get update -y && apt-get install -y unzip; }
command -v rsync >/dev/null || { apt-get update -y && apt-get install -y rsync; }

ARCHIVE="${ARCHIVE:-$(ls -t /root/Few-few*.zip 2>/dev/null | head -1 || true)}"
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || die "Няма Few-few ZIP в /root (или подай ARCHIVE=...)."
log "Архив: $ARCHIVE"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip -q "$ARCHIVE" -d "$TMP"
SRV="$(find "$TMP" -type d -path '*/adblock/server' | head -1)"
[ -d "$SRV" ] || die "adblock/server/ липсва в архива."
ok "Разопаковано: $SRV"

# --- Копиране на обслужваните файлове ---
mkdir -p "$WWW"
for f in index.html privacy.html filters.json robots.txt sitemap.xml llms.txt \
         og.png favicon.svg favicon-48.png apple-touch-icon.png icon-512.png; do
  [ -f "$SRV/$f" ] && rsync -a "$SRV/$f" "$WWW"/
done
[ -d "$SRV/.well-known" ] && { mkdir -p "$WWW/.well-known"; rsync -a "$SRV/.well-known/" "$WWW/.well-known/"; }

INKEY=""
if [ -f "$SRV/indexnow_key.txt" ]; then
  INKEY="$(tr -d '[:space:]' < "$SRV/indexnow_key.txt")"
  [ -n "$INKEY" ] && printf '%s' "$INKEY" > "$WWW/$INKEY.txt"
fi
chmod 755 "$WWW"; find "$WWW" -maxdepth 2 -type f -exec chmod 644 {} +
id caddy >/dev/null 2>&1 && chown -R caddy:caddy "$WWW" || true
ok "Файловете → $WWW"

# --- Ed25519 подпис на filters.json (ако ключът е на сървъра) ---
if [ -f "$KEY" ]; then
  if openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$WWW/filters.json" 2>/dev/null \
       | base64 -w0 > "$WWW/filters.json.sig" && [ -s "$WWW/filters.json.sig" ]; then
    chmod 644 "$WWW/filters.json.sig"
    id caddy >/dev/null 2>&1 && chown caddy:caddy "$WWW/filters.json.sig" || true
    ok "filters.json подписан"
  else
    rm -f "$WWW/filters.json.sig"; warn "подписването се провали — ъпдейтите ще вървят неподписани"
  fi
fi

# --- Nginx vhost (ако липсва) + reload + TLS ---
if command -v nginx >/dev/null; then
  if [ ! -f "$NSITE" ] && [ -f "$SRV/nginx.conf" ]; then
    install -m 644 "$SRV/nginx.conf" "$NSITE"
    ln -sf "$NSITE" /etc/nginx/sites-enabled/adblock.conf
    ok "nginx vhost инсталиран"
  fi
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx 2>/dev/null || nginx -s reload
    ok "nginx презареден"
  else
    warn "nginx -t провал — НЕ презареждам (провери конфига)"
  fi
  if command -v certbot >/dev/null; then
    certbot --nginx -d "$DOMAIN" -n --agree-tos --redirect --keep-until-expiring >/dev/null 2>&1 \
      && ok "TLS активен" || warn "certbot не успя (провери DNS към този VPS)"
  fi
fi

# --- IndexNow (уведоми Bing/Yandex/Seznam) ---
if [ -n "$INKEY" ]; then
  B="https://$DOMAIN"
  curl -fsS -m 10 -H "Content-Type: application/json" \
    -d "{\"host\":\"$DOMAIN\",\"key\":\"$INKEY\",\"keyLocation\":\"$B/$INKEY.txt\",\"urlList\":[\"$B/\",\"$B/privacy\"]}" \
    https://api.indexnow.org/indexnow >/dev/null 2>&1 \
    && ok "IndexNow уведоми Bing/Yandex/Seznam" || warn "IndexNow ping не мина"
fi

# --- Health ---
curl -fsS -o /dev/null -m 6 "https://$DOMAIN/" \
  && ok "Сайтът е жив: https://$DOMAIN/" \
  || warn "публичният health не мина — провери DNS/TLS"

echo; ok "Готово. Hard refresh (Ctrl+Shift+R) в браузъра."
