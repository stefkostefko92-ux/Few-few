#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  PANEV ASCENSORI — еднократна подготовка на сървъра (Ubuntu 24.04, като root)
#
#  Прави това, което НЕ е част от деплоя на кода: пакети, системен потребител,
#  /etc/panev/panev.env с ГЕНЕРИРАНИ тайни, systemd unit, nginx vhost (301 от
#  www към каноничния non-www домейн), TLS през certbot, ufw и дневен бекъп.
#
#  Кодът се качва ОТДЕЛНО, с каноничния поток на монорепото:
#      sudo PROJECTS="panev" bash deploy/autodeploy.sh
#
#  Употреба (от разопакования архив):
#      sudo bash panev/scripts/bootstrap-vps.sh
#      sudo DOMAIN=panevascensori.it CERTBOT_EMAIL=info@panevascensori.it \
#           bash panev/scripts/bootstrap-vps.sh
#
#  Идемпотентен: повторно пускане НЕ презаписва вече генерирани тайни и не
#  дублира cron ред. Нищо разрушително — не пипа базата в /opt/panev/data.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Пусни като root (sudo)." >&2; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # .../panev
APP_USER=panev
APP_HOME=/opt/panev
ENV_DIR=/etc/panev
ENV_FILE="$ENV_DIR/panev.env"
APP_PORT="${APP_PORT:-4102}"

# Каноничният домейн е БЕЗ www — така са canonical/hreflang/sitemap/JSON-LD в
# генерирания сайт. www.* съществува само за да прави 301 насам.
DOMAIN="${DOMAIN:-panevascensori.it}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-info@panevascensori.it}"

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m  ✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ⚠ %s\033[0m\n' "$*"; }
ask()  { local __v=$1 __p=$2 __d=${3:-} __in; read -rp "  $__p${__d:+ [$__d]}: " __in </dev/tty || true; printf -v "$__v" '%s' "${__in:-$__d}"; }
asksecret() { local __v=$1 __p=$2 __d=${3:-} __in; read -rsp "  $__p${__d:+ (Enter = запази текущата)}: " __in </dev/tty || true; echo >/dev/tty; printf -v "$__v" '%s' "${__in:-$__d}"; }

say "Подготовка за $DOMAIN (код: $HERE, инсталация: $APP_HOME)"

# ── 1. Пакети ────────────────────────────────────────────────────────────────
say "Пакети"
need=()
command -v nginx   >/dev/null || need+=(nginx)
command -v certbot >/dev/null || need+=(certbot python3-certbot-nginx)
command -v sqlite3 >/dev/null || need+=(sqlite3)
command -v rsync   >/dev/null || need+=(rsync)
command -v openssl >/dev/null || need+=(openssl)
command -v ufw     >/dev/null || need+=(ufw)
if ((${#need[@]})); then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq "${need[@]}"
fi
NODE_MAJOR=0
command -v node >/dev/null && NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( NODE_MAJOR < 20 )); then
  say "Node.js 20 (текущ: ${NODE_MAJOR:-няма})"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
ok "node $(node -v) · nginx $(nginx -v 2>&1 | cut -d/ -f2) · $(certbot --version 2>&1 | head -1)"

# ── 2. Потребител и директории ───────────────────────────────────────────────
say "Системен потребител и директории"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_HOME"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$APP_HOME/data"   # SQLite — единственият записваем път
# Групата е panev → услугата и сийдът могат да ЧЕТАТ файла вътре (самият файл
# е 600 panev:panev); за всички останали папката е недостъпна.
install -d -o root -g "$APP_USER" -m 750 "$ENV_DIR"
ok "$APP_USER · $APP_HOME (data/ = 700) · $ENV_DIR"

# ── 3. Конфигурация с тайни (идемпотентно) ───────────────────────────────────
say "Конфигурация: $ENV_FILE (mode 600)"
prev() { [[ -f "$ENV_FILE" ]] && sed -n "s/^$1=//p" "$ENV_FILE" | head -n1 || true; }

JWT_SECRET="$(prev JWT_SECRET)"; JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 64)}"
ADMIN_EMAIL="$(prev ADMIN_EMAIL)"; ADMIN_EMAIL="${ADMIN_EMAIL:-info@panevascensori.it}"
SMTP_HOST="$(prev SMTP_HOST)";   SMTP_HOST="${SMTP_HOST:-smtps.aruba.it}"
SMTP_PORT="$(prev SMTP_PORT)";   SMTP_PORT="${SMTP_PORT:-465}"
SMTP_USER="$(prev SMTP_USER)";   SMTP_USER="${SMTP_USER:-info@panevascensori.it}"
SMTP_PASS="$(prev SMTP_PASS)"

ask ADMIN_EMAIL "Админ имейл (вход в /admin)" "$ADMIN_EMAIL"
echo "  SMTP на пощенската кутия $SMTP_USER — БЕЗ парола формата записва в базата, но НЕ праща имейл."
asksecret SMTP_PASS "SMTP парола" "$SMTP_PASS"

install -o "$APP_USER" -g "$APP_USER" -m 600 /dev/null "$ENV_FILE.new"
{
  echo "NODE_ENV=production"
  echo "PORT=$APP_PORT"
  echo "BASE_URL=https://$DOMAIN"
  echo "JWT_SECRET=$JWT_SECRET"
  echo "JWT_EXPIRES=4h"
  echo "ADMIN_EMAIL=$ADMIN_EMAIL"
  echo "SMTP_HOST=$SMTP_HOST"
  echo "SMTP_PORT=$SMTP_PORT"
  echo "SMTP_USER=$SMTP_USER"
  echo "SMTP_PASS=${SMTP_PASS:-CHANGE_ME}"
  echo "MAIL_FROM=\"Panev Ascensori <$SMTP_USER>\""
  echo "MAIL_TO_ADMIN=$ADMIN_EMAIL"
} > "$ENV_FILE.new"
mv -f "$ENV_FILE.new" "$ENV_FILE"
chmod 600 "$ENV_FILE"; chown "$APP_USER:$APP_USER" "$ENV_FILE"
[[ -n "$SMTP_PASS" ]] || warn "SMTP_PASS остава CHANGE_ME — попълни го после в $ENV_FILE и: systemctl restart panev"
ok "Тайните са само тук (600) — извън репото и извън деплой архива."

# ── 4. systemd unit ──────────────────────────────────────────────────────────
say "systemd unit"
install -m 644 "$HERE/deploy/systemd/panev.service" /etc/systemd/system/panev.service
systemctl daemon-reload
systemctl enable panev >/dev/null 2>&1 || true
ok "panev.service инсталиран (стартира при качване на кода с autodeploy)"

# ── 5. Защитна стена ─────────────────────────────────────────────────────────
say "ufw (22/80/443)"
ufw allow 22/tcp  >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw status | grep -q "Status: active" || ufw --force enable >/dev/null
ok "$(ufw status | head -1)"

# ── 6. nginx vhost + TLS ─────────────────────────────────────────────────────
say "nginx vhost + TLS"
# Ако домейнът е различен, подменяме го навсякъде в шаблона (вкл. пътищата към
# сертификата и www. префикса).
sed "s/panevascensori\.it/$DOMAIN/g" "$HERE/deploy/nginx/panev.conf" \
  > /etc/nginx/sites-available/panev.conf

if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  # Пилето и яйцето: пълният vhost сочи още несъществуващ сертификат и чупи
  # `nginx -t`. Затова първо вдигаме временен HTTP-only блок само за ACME,
  # взимаме сертификата (за домейна И за www.), после активираме пълния vhost.
  mkdir -p /var/www/html
  cat > /etc/nginx/sites-available/panev-acme.conf <<NG
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    root /var/www/html;
    location /.well-known/acme-challenge/ { allow all; }
}
NG
  rm -f /etc/nginx/sites-enabled/panev.conf
  ln -sf ../sites-available/panev-acme.conf /etc/nginx/sites-enabled/panev-acme.conf
  nginx -t && systemctl reload nginx
  # www. трябва да е в сертификата — иначе https://www.… гърми с cert-mismatch
  # ПРЕДИ да стигне до 301 редиректа.
  certbot certonly --webroot -w /var/www/html \
    -d "$DOMAIN" -d "www.$DOMAIN" \
    --non-interactive --agree-tos -m "$CERTBOT_EMAIL" || {
      warn "certbot се провали — провери, че A/AAAA записите на $DOMAIN и www.$DOMAIN сочат този сървър."
      warn "Оправи DNS и пусни пак този скрипт."
    }
  rm -f /etc/nginx/sites-enabled/panev-acme.conf
fi

if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  ln -sf ../sites-available/panev.conf /etc/nginx/sites-enabled/panev.conf
  if nginx -t; then
    systemctl reload nginx
    ok "vhost активен: https://$DOMAIN (www → 301)"
  else
    warn "nginx -t се провали — vhost-ът НЕ е презареден. Виж грешката по-горе."
  fi
else
  warn "Няма сертификат за $DOMAIN — пълният HTTPS vhost НЕ е активиран. Пусни пак след DNS."
fi

# certbot renew hook: след подновяване nginx трябва да презареди сертификата.
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
# Презарежда nginx след успешно подновяване (ARI-базирано, systemd таймерът на
# certbot проверява 2× дневно). Общ за всички сайтове на машината.
systemctl reload nginx || true
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
systemctl enable --now certbot.timer >/dev/null 2>&1 || true

# ── 7. Дневен бекъп на базата + logrotate ────────────────────────────────────
say "Дневен бекъп (03:15 UTC)"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 /var/backups/panev
install -o "$APP_USER" -g "$APP_USER" -m 640 /dev/null /var/log/panev-backup.log
cat > /etc/cron.d/panev-backup <<CRON
# Panev Ascensori — дневен бекъп на SQLite базата
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * $APP_USER $APP_HOME/scripts/backup.sh >> /var/log/panev-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/panev-backup
cat > /etc/logrotate.d/panev-backup <<'LR'
/var/log/panev-backup.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    create 0640 panev panev
}
LR
ok "cron: /etc/cron.d/panev-backup · лог: /var/log/panev-backup.log"

# ── Готово ───────────────────────────────────────────────────────────────────
say "Подготовката приключи"
cat <<EOF

  Домейн:     https://$DOMAIN   (www.$DOMAIN → 301)
  Тайни:      $ENV_FILE  (mode 600, $APP_USER:$APP_USER)
  Услуга:     systemctl status panev   ·   journalctl -u panev -f
  Порт:       127.0.0.1:$APP_PORT  (само локално, зад nginx)

  Следваща стъпка — качи кода (от корена на разопакования архив):
    sudo PROJECTS="panev" bash deploy/autodeploy.sh

  След първия деплой:
    • влез в https://$DOMAIN/admin/login.html и СМЕНИ паролата
      (паролата от първия сийд се показва ВЕДНЪЖ в изхода на autodeploy)
    • тествай формата на https://$DOMAIN/contatti (иска SMTP_PASS)
    • тествай restore на бекъп поне веднъж (бекъп без тестван restore не е бекъп)
EOF
