#!/usr/bin/env bash
# Vizitka — еднократна подготовка на сървъра (Ubuntu/Debian, като root).
#
# Прави наведнъж всичко, което НЕ е автоматизирано от репото: системен
# потребител + директории, /etc/vizitka/vizitka.env с ГЕНЕРИРАНИ тайни,
# systemd unit, nginx vhost, TLS през certbot и криптиран бекъп cron.
# Идемпотентен е — пуснат повторно НЕ презаписва вече генерирани тайни и не
# дублира ред в crontab. Кодът се качва отделно (deploy/autodeploy.sh).
#
# Употреба (от корена на разопакования архив ИЛИ от vizitka/):
#   sudo bash vizitka/deploy/server-setup.sh
#   # по желание — предварително зададени стойности (иначе пита с default):
#   sudo DOMAIN=vizitka-bg.com ADMIN_EMAIL=ti@example.com \
#        AGE_RECIPIENT=age1... bash vizitka/deploy/server-setup.sh
#
# След него: `sudo PROJECTS="vizitka" bash deploy/autodeploy.sh` качва кода.

set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Пусни като root (sudo)." >&2; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../vizitka/deploy
APP_USER=vizitka
APP_HOME=/opt/vizitka
ENV_DIR=/etc/vizitka
ENV_FILE="$ENV_DIR/vizitka.env"

DOMAIN="${DOMAIN:-vizitka-bg.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-stefan.kostadinov16@gmail.com}"
MASTILKO_URL="${MASTILKO_URL:-https://mastilko-bg.com}"

say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ask() { # ask VAR "Подкана" "default"
  local __v=$1 __p=$2 __d=${3:-} __in
  read -rp "$__p${__d:+ [$__d]}: " __in </dev/tty || true
  printf -v "$__v" '%s' "${__in:-$__d}"
}

# ── 0. Пакети ────────────────────────────────────────────────────────────────
say "Проверявам пакети (nginx, certbot, sqlite3, age)"
need_pkg=()
command -v nginx   >/dev/null || need_pkg+=(nginx)
command -v certbot >/dev/null || need_pkg+=(certbot python3-certbot-nginx)
command -v sqlite3 >/dev/null || need_pkg+=(sqlite3)
command -v age     >/dev/null || need_pkg+=(age)
command -v node    >/dev/null || echo "  ! Node.js не е намерен — инсталирай Node ≥20 преди autodeploy."
if ((${#need_pkg[@]})); then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${need_pkg[@]}"
fi

# ── 1. Потребител и директории ──────────────────────────────────────────────
say "Системен потребител и директории"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_HOME/data/uploads" "$ENV_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_HOME"

# ── 2. Тайни + env файл (не презаписва вече генерирани) ──────────────────────
say "Конфигурация с тайни: $ENV_FILE"
gen_hex() { node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"; }

# Ако файлът съществува, запази вече зададените тайни (идемпотентност).
prev() { [[ -f "$ENV_FILE" ]] && sed -n "s/^$1=//p" "$ENV_FILE" | head -n1 || true; }
PRINT_API_SECRET="$(prev PRINT_API_SECRET)"; PRINT_API_SECRET="${PRINT_API_SECRET:-$(gen_hex 32)}"
INDEXNOW_KEY="$(prev INDEXNOW_KEY)";         INDEXNOW_KEY="${INDEXNOW_KEY:-$(gen_hex 16)}"

# Запази вече конфигурираните портфейл редове (коментирани или не) — идемпотентност.
WALLET_LINES="$([[ -f "$ENV_FILE" ]] && grep -E '^#? *(APPLE_|GOOGLE_WALLET_)' "$ENV_FILE" || true)"

# Домейн/админ (default = стойностите на проекта).
ask DOMAIN      "Домейн" "$DOMAIN"
ask ADMIN_EMAIL "Админ имейл (достъп до /admin)" "$ADMIN_EMAIL"

# SMTP за „забравена парола" — по избор. Без SMTP_HOST писмата само се логват.
say "SMTP за нулиране на парола (Enter пропуска — писмата ще се само логват)"
SMTP_HOST="$(prev SMTP_HOST)"; ask SMTP_HOST "SMTP хост" "$SMTP_HOST"
SMTP_USER="$(prev SMTP_USER)"; SMTP_PASS="$(prev SMTP_PASS)"
MAIL_FROM="$(prev MAIL_FROM)"; MAIL_FROM="${MAIL_FROM:-Vizitka <no-reply@$DOMAIN>}"
if [[ -n "$SMTP_HOST" ]]; then
  ask SMTP_USER "SMTP потребител" "$SMTP_USER"
  ask SMTP_PASS "SMTP парола"     "$SMTP_PASS"
  ask MAIL_FROM "Подател (From)"  "$MAIL_FROM"
fi

umask 077
{
  echo "NODE_ENV=production"
  echo "PORT=3100"
  echo "PUBLIC_BASE_URL=https://$DOMAIN"
  echo "ADMIN_EMAILS=$ADMIN_EMAIL"
  echo "MASTILKO_URL=$MASTILKO_URL"
  echo "PRINT_API_SECRET=$PRINT_API_SECRET"
  echo "INDEXNOW_KEY=$INDEXNOW_KEY"
  echo "MAIL_FROM=$MAIL_FROM"
  if [[ -n "$SMTP_HOST" ]]; then
    echo "SMTP_HOST=$SMTP_HOST"
    echo "SMTP_PORT=587"
    echo "SMTP_SECURE=false"
    echo "SMTP_USER=$SMTP_USER"
    echo "SMTP_PASS=$SMTP_PASS"
  fi
  # Портфейли (Apple/Google) — попълни при готовност (виж DEPLOY.md, секция 7).
  if [[ -n "$WALLET_LINES" ]]; then
    echo "$WALLET_LINES"
  else
    echo "# APPLE_TEAM_ID="
    echo "# APPLE_PASS_TYPE_ID=pass.eu.carbonstealth.vizitka"
    echo "# APPLE_PASS_CERT=/etc/vizitka/apple/signerCert.pem"
    echo "# APPLE_PASS_KEY=/etc/vizitka/apple/signerKey.pem"
    echo "# APPLE_PASS_KEY_PASSPHRASE="
    echo "# APPLE_WWDR_CERT=/etc/vizitka/apple/wwdr.pem"
    echo "# APPLE_APNS_KEY=/etc/vizitka/apple/AuthKey.p8"
    echo "# APPLE_APNS_KEY_ID="
    echo "# GOOGLE_WALLET_ISSUER_ID="
    echo "# GOOGLE_WALLET_SA_KEY=/etc/vizitka/google/service-account.json"
  fi
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
chown "$APP_USER:$APP_USER" "$ENV_FILE"

# ── 3. systemd unit ──────────────────────────────────────────────────────────
say "systemd unit"
cp "$HERE/systemd/vizitka.service" /etc/systemd/system/vizitka.service
systemctl daemon-reload
systemctl enable vizitka >/dev/null

# ── 4. nginx vhost + TLS ─────────────────────────────────────────────────────
say "nginx vhost + TLS (certbot)"
# Ако домейнът е различен от vizitka-bg.com, подмени server_name.
sed "s/vizitka-bg\.com/$DOMAIN/g" "$HERE/nginx/vizitka.conf" > /etc/nginx/sites-available/vizitka.conf
ln -sf ../sites-available/vizitka.conf /etc/nginx/sites-enabled/vizitka.conf
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  # Първо издаване: --nginx сам вдига временен HTTP блок; ако още няма сертификат,
  # certbot ще редактира конфигурацията при успех.
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" || {
    echo "  ! certbot се провали (провери, че DNS за $DOMAIN сочи този сървър)."
    echo "    Пусни ръчно после: certbot certonly --nginx -d $DOMAIN"
  }
fi
nginx -t && systemctl reload nginx

# ── 5. Криптиран бекъп (age) + logrotate ─────────────────────────────────────
say "Криптиран бекъп cron"
AGE_RECIPIENT="${AGE_RECIPIENT:-}"
if [[ -z "$AGE_RECIPIENT" ]]; then
  echo "  Няма зададен AGE_RECIPIENT (публичен age ключ)."
  ask GEN "  Да генерирам ли age двойка тук? Частният ключ ще се покаже ВЕДНЪЖ — запази го извън сървъра (y/N)" "N"
  if [[ "${GEN,,}" == y ]]; then
    KEYFILE="$(mktemp)"
    age-keygen -o "$KEYFILE" 2>/tmp/age-pub.txt
    AGE_RECIPIENT="$(sed -n 's/^# public key: //p' /tmp/age-pub.txt)"
    echo "  ┌─ ЧАСТЕН age КЛЮЧ (копирай СЕГА, няма да се покаже пак) ─────────"
    sed 's/^/  │ /' "$KEYFILE"
    echo "  └────────────────────────────────────────────────────────────────"
    echo "  Публичен (recipient): $AGE_RECIPIENT"
    shred -u "$KEYFILE" 2>/dev/null || rm -f "$KEYFILE"
    rm -f /tmp/age-pub.txt
  fi
fi
if [[ -n "$AGE_RECIPIENT" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 640 /dev/null /var/log/vizitka-backup.log
  cp "$HERE/logrotate/vizitka-backup" /etc/logrotate.d/vizitka-backup
  CRON="25 3 * * * $APP_USER AGE_RECIPIENT=$AGE_RECIPIENT $APP_HOME/deploy/backup.sh >> /var/log/vizitka-backup.log 2>&1"
  echo "$CRON" > /etc/cron.d/vizitka-backup
  chmod 644 /etc/cron.d/vizitka-backup
  echo "  Бекъп cron инсталиран (дневно 03:25). Тествай restore поне веднъж!"
else
  echo "  ! Бекъпът е пропуснат (няма AGE_RECIPIENT). Задай го и пусни пак за да го включиш."
fi

# ── Готово ───────────────────────────────────────────────────────────────────
say "Подготовката приключи"
cat <<EOF

  Домейн:        https://$DOMAIN
  Env файл:      $ENV_FILE  (mode 600)
  IndexNow ключ: /$INDEXNOW_KEY.txt
  systemd:       systemctl status vizitka   (кодът се качва с autodeploy)

  Следваща стъпка — качи кода и стартирай:
    sudo PROJECTS="vizitka" bash deploy/autodeploy.sh

  После (еднократно, в браузъра):
    • Google Search Console → добави https://$DOMAIN, подай sitemap.xml
    • Bing Webmaster Tools  → добави сайта, подай sitemap.xml
EOF
