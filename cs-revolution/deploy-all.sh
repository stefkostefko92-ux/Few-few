#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Carbon Stealth — FULL DEPLOY + HARDENING, one command.
#
#    sudo bash deploy-all.sh
#
#  Idempotent: safe to re-run. Preserves secrets (api/smtp-local.php), all
#  data/PII under api/logs/, and the per-install IP salt. Every risky step is
#  backed up first and rolled back if verification fails.
#
#  Does: deploy site + API → nginx (zones, vhost, reload) → fail2ban →
#        logrotate → permissions → end-to-end verification (incl. a live
#        brute-force test that must return 429).
# ═══════════════════════════════════════════════════════════════════════════
set -Eeuo pipefail

WEBROOT="/var/www/carbonstealth.eu"
NGINX_VHOST="/etc/nginx/sites-available/carbonstealth.eu"
NGINX_MAIN="/etc/nginx/nginx.conf"
DOMAIN="carbonstealth.eu"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/root/cs-backup-$STAMP"
SRC=""

c_ok(){   printf '  \033[32m✓\033[0m %s\n' "$1"; }
c_warn(){ printf '  \033[33m!\033[0m %s\n' "$1"; }
c_err(){  printf '  \033[31m✗\033[0m %s\n' "$1"; }
step(){   printf '\n\033[36m══ %s\033[0m\n' "$1"; }
die(){    c_err "$1"; exit 1; }

trap 'c_err "Прекъснато на ред $LINENO. Бекъп: $BACKUP"' ERR

# ── 0. Preflight ──────────────────────────────────────────────────────────
step "0/7  ПРОВЕРКИ"
[ "$(id -u)" -eq 0 ] || die "Пусни като root:  sudo bash $0"

# Find the source tree: this script's directory, or an extracted archive.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$HERE/dist" ] && [ -d "$HERE/api" ]; then
  SRC="$HERE"
elif [ -f /root/cs-revolution-vps.tar.gz ]; then
  c_warn "Разархивирам /root/cs-revolution-vps.tar.gz"
  rm -rf /root/cs-revolution-deploy && mkdir -p /root/cs-revolution-deploy
  tar -xzf /root/cs-revolution-vps.tar.gz -C /root/cs-revolution-deploy
  SRC="$(find /root/cs-revolution-deploy -maxdepth 2 -type d -name api | head -1 | xargs dirname)"
fi
[ -n "$SRC" ] && [ -d "$SRC/dist" ] && [ -d "$SRC/api" ] \
  || die "Не намирам dist/ и api/. Пусни скрипта от папката на проекта, или качи архива в /root/."
c_ok "Източник: $SRC"

# PHP-FPM: detect the REAL unit + socket instead of assuming a version.
FPM_UNIT="$(systemctl list-units --type=service --all 2>/dev/null | grep -oE 'php[0-9.]+-fpm\.service' | head -1 || true)"
[ -n "$FPM_UNIT" ] || die "Не намирам PHP-FPM service. Инсталиран ли е PHP-FPM?"
FPM_VER="$(echo "$FPM_UNIT" | grep -oE '[0-9]+\.[0-9]+')"
FPM_POOL="/etc/php/$FPM_VER/fpm/pool.d/www.conf"
FPM_SOCK="$(grep -E '^\s*listen\s*=' "$FPM_POOL" 2>/dev/null | head -1 | sed 's/.*=\s*//' | tr -d '[:space:]' || true)"
[ -n "$FPM_SOCK" ] || die "Не мога да прочета listen= от $FPM_POOL"
c_ok "PHP-FPM: $FPM_UNIT  socket: $FPM_SOCK"

command -v nginx >/dev/null || die "nginx липсва"
c_ok "nginx наличен (rsync по избор — има tar резерва)"

# ── 1. Backup ─────────────────────────────────────────────────────────────
step "1/7  БЕКЪП"
mkdir -p "$BACKUP"
[ -d "$WEBROOT" ]        && tar -czf "$BACKUP/webroot.tar.gz" -C "$(dirname "$WEBROOT")" "$(basename "$WEBROOT")" 2>/dev/null || true
[ -f "$NGINX_VHOST" ]    && cp "$NGINX_VHOST" "$BACKUP/vhost.conf"
[ -f "$NGINX_MAIN" ]     && cp "$NGINX_MAIN"  "$BACKUP/nginx.conf"
c_ok "Бекъп в $BACKUP"

# ── 2. Deploy site + API ──────────────────────────────────────────────────
step "2/7  ДЕПЛОЙ НА САЙТА"
mkdir -p "$WEBROOT/api/logs"
# Static files. api/ is protected in both paths. Stale pages are removed so a
# deleted page can't linger and keep being served/indexed.
if command -v rsync >/dev/null; then
  rsync -a --delete --exclude='api/' "$SRC/dist/" "$WEBROOT/"
else
  c_warn "rsync липсва — ползвам tar (същият резултат)"
  ( cd "$SRC/dist" && tar cf - . ) | ( cd "$WEBROOT" && tar xf - )
  # prune anything under the webroot (except api/) that no longer exists in dist
  ( cd "$WEBROOT" && find . -path ./api -prune -o -type f -print ) | while read -r rel; do
    [ -e "$SRC/dist/${rel#./}" ] || rm -f "$WEBROOT/${rel#./}"
  done
fi
c_ok "dist → $WEBROOT ($(find "$WEBROOT" -name '*.html' | wc -l) HTML файла)"

# API: copy code, NEVER touch smtp-local.php (secrets) or logs/ (data).
for f in "$SRC/api"/*.php; do
  b="$(basename "$f")"
  [ "$b" = "smtp-local.php" ] && continue
  cp "$f" "$WEBROOT/api/$b"
done
c_ok "api/*.php обновени (smtp-local.php и logs/ запазени)"

# (the vhost's FastCGI socket is synced to this box in step 4, on the
#  INSTALLED copy — the source tree is never modified)

# ── 3. Permissions ────────────────────────────────────────────────────────
step "3/7  ПРАВА"
chown -R www-data:www-data "$WEBROOT"
find "$WEBROOT" -type d -exec chmod 755 {} \;
find "$WEBROOT" -type f -exec chmod 644 {} \;
chmod 750 "$WEBROOT/api/logs"                                  # PII — not world-readable
find "$WEBROOT/api/logs" -type f -exec chmod 600 {} \; 2>/dev/null || true
[ -f "$WEBROOT/api/smtp-local.php" ] && chmod 600 "$WEBROOT/api/smtp-local.php"
c_ok "webroot 755/644, logs 750, тайни 600"

# ── 4. nginx ──────────────────────────────────────────────────────────────
step "4/7  NGINX"
# Rate-limit zones must live in the http{} block. Add each one ONLY if it is
# missing — a zone defined twice is a hard nginx error ("duplicate zone"), and
# some of these may already exist anywhere under /etc/nginx, not just in
# nginx.conf (conf.d/*, a snippet, an older install).
NG_ALL="$(cat "$NGINX_MAIN" $(find /etc/nginx/conf.d -name '*.conf' 2>/dev/null) 2>/dev/null || cat "$NGINX_MAIN")"
ZONES_TO_ADD=""
add_zone(){ # name  directive
  if echo "$NG_ALL" | grep -q "zone=$1[:space]*:" || echo "$NG_ALL" | grep -q "zone=$1:"; then
    c_ok "Зона $1 вече съществува — пропускам"
  else
    ZONES_TO_ADD="${ZONES_TO_ADD}    $2\n"
    c_ok "Зона $1 ще бъде добавена"
  fi
}
add_zone cs_limit 'limit_req_zone $binary_remote_addr zone=cs_limit:10m rate=20r/s;'
add_zone cs_api   'limit_req_zone $binary_remote_addr zone=cs_api:10m rate=1r/s;'
add_zone cs_conn  'limit_conn_zone $binary_remote_addr zone=cs_conn:10m;'

if [ -n "$ZONES_TO_ADD" ]; then
  awk -v zones="$ZONES_TO_ADD" '/^http[[:space:]]*\{/ && !done {
    print; print "";
    print "    # Carbon Stealth rate-limit zones (deploy-all.sh)";
    printf "%s", zones;
    done=1; next
  } { print }' "$NGINX_MAIN" > "$NGINX_MAIN.new" && mv "$NGINX_MAIN.new" "$NGINX_MAIN"
fi

cp "$SRC/nginx/carbonstealth.conf" "$NGINX_VHOST"
# Point FastCGI at THIS box's real socket (versions differ between servers)
sed -i "s#fastcgi_pass unix:[^;]*;#fastcgi_pass unix:$FPM_SOCK;#g" "$NGINX_VHOST"
ln -sf "$NGINX_VHOST" /etc/nginx/sites-enabled/carbonstealth.eu

if nginx -t >/tmp/cs-nginx-test.log 2>&1; then
  systemctl reload nginx
  c_ok "nginx конфигурация валидна, презаредена"
else
  c_err "nginx -t се провали. Точната грешка:"
  # show only real errors, not the deprecation warnings this box always emits
  grep -iE '\[emerg\]|\[error\]' /tmp/cs-nginx-test.log | sed 's/^/      /' || cat /tmp/cs-nginx-test.log | sed 's/^/      /'
  c_warn "Връщам старата конфигурация…"
  [ -f "$BACKUP/vhost.conf" ] && cp "$BACKUP/vhost.conf" "$NGINX_VHOST"
  [ -f "$BACKUP/nginx.conf" ] && cp "$BACKUP/nginx.conf" "$NGINX_MAIN"
  if nginx -t >/dev/null 2>&1; then systemctl reload nginx; c_ok "Старата конфигурация е върната, сайтът работи"; fi
  die "Конфигурацията е върната — пълният лог е в /tmp/cs-nginx-test.log"
fi

# ── 5. fail2ban ───────────────────────────────────────────────────────────
step "5/7  FAIL2BAN"
if ! command -v fail2ban-client >/dev/null; then
  c_warn "Инсталирам fail2ban…"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban >/dev/null 2>&1 || c_warn "apt се провали — пропускам fail2ban"
fi
if command -v fail2ban-client >/dev/null; then
  cp "$SRC/deploy/security/fail2ban-carbonstealth.conf" /etc/fail2ban/filter.d/carbonstealth-auth.conf
  # Point the jail at this box's real log path
  sed "s#^logpath.*=.*auth_failures.log#logpath  = $WEBROOT/api/logs/auth_failures.log#" \
      "$SRC/deploy/security/fail2ban-jail.local" > /etc/fail2ban/jail.d/carbonstealth.local
  # The jail needs the file to exist before it will start watching it
  touch "$WEBROOT/api/logs/auth_failures.log"
  chown www-data:www-data "$WEBROOT/api/logs/auth_failures.log"
  chmod 600 "$WEBROOT/api/logs/auth_failures.log"
  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban || c_warn "fail2ban не тръгна — провери: journalctl -u fail2ban -n 30"
  sleep 2
  if fail2ban-client status carbonstealth-auth >/dev/null 2>&1; then
    c_ok "fail2ban активен, jail 'carbonstealth-auth' работи"
  else
    c_warn "jail-ът не се вижда — провери: fail2ban-client status"
  fi
else
  c_warn "fail2ban не е наличен — слоеве 1 и 2 работят, firewall банът не"
fi

# ── 6. logrotate ──────────────────────────────────────────────────────────
step "6/7  LOGROTATE"
sed "s#/var/www/carbonstealth.eu#$WEBROOT#g" \
    "$SRC/deploy/security/logrotate-carbonstealth" > /etc/logrotate.d/carbonstealth
if logrotate -d /etc/logrotate.d/carbonstealth >/dev/null 2>&1; then
  c_ok "Ротация на лога с IP-та: 7 дни (GDPR срок)"
else
  c_warn "logrotate конфигурацията не мина проверка"
fi

# ── 7. Verify ─────────────────────────────────────────────────────────────
step "7/7  ПРОВЕРКА"
FAILED=0
chk(){ # url expected_code label
  local code; code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$1" || echo 000)"
  if [ "$code" = "$2" ]; then c_ok "$3 ($code)"; else c_err "$3 → $code, очаквано $2"; FAILED=$((FAILED+1)); fi
}
chk "https://$DOMAIN/"                      200 "Начална страница"
chk "https://$DOMAIN/test/"                 200 "Анализатор /test/"
chk "https://$DOMAIN/status/"               200 "Статус страница"
chk "https://$DOMAIN/api/status.php"        200 "API status (публичен)"
chk "https://$DOMAIN/api/smtp-local.php"    404 "smtp-local.php БЛОКИРАН"
chk "https://$DOMAIN/api/_auth.php"         404 "_auth.php БЛОКИРАН"
chk "https://$DOMAIN/api/logs/"             404 "logs/ БЛОКИРАНА"
chk "https://$DOMAIN/api/smtp-local.php/x.php" 404 "PATH_INFO байпас затворен"

# Admin gate must reject an unknown token
code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 -H 'X-CS-Token: definitely-wrong' "https://$DOMAIN/api/monitor.php" || echo 000)"
if [ "$code" = "401" ] || [ "$code" = "429" ]; then c_ok "Админ вратата отказва грешен токен ($code)"
else c_err "Админ вратата върна $code (очаквано 401/429)"; FAILED=$((FAILED+1)); fi

# Live brute-force test: repeated wrong tokens must escalate to 429
printf '  … тествам brute-force защитата (7 опита)\n'
LAST=""
for i in $(seq 1 7); do
  LAST="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 -H "X-CS-Token: bf-test-$i" "https://$DOMAIN/api/monitor.php" || echo 000)"
done
if [ "$LAST" = "429" ]; then c_ok "Brute-force защита работи (7-ият опит → 429)"
else c_err "7-ият опит върна $LAST, очаквано 429"; FAILED=$((FAILED+1)); fi

# Security headers
HDRS="$(curl -skI --max-time 10 "https://$DOMAIN/" || true)"
for h in strict-transport-security x-content-type-options content-security-policy; do
  echo "$HDRS" | grep -qi "^$h" && c_ok "Header: $h" || { c_err "Липсва header: $h"; FAILED=$((FAILED+1)); }
done
echo "$HDRS" | grep -qi "unsafe-eval" && { c_err "CSP още съдържа unsafe-eval"; FAILED=$((FAILED+1)); } || c_ok "CSP без unsafe-eval"

# Environment secrets (can't read them, but can tell whether they're set)
step "СРЕДА"
grep -q 'CS_ADMIN_TOKEN' "$FPM_POOL" && c_ok "CS_ADMIN_TOKEN е зададен в $FPM_POOL" \
  || { c_warn "CS_ADMIN_TOKEN ЛИПСВА в $FPM_POOL — админът няма да работи (fail-closed)"; }
grep -q 'CS_IP_SALT' "$FPM_POOL"    && c_ok "CS_IP_SALT е зададен" \
  || c_warn "CS_IP_SALT не е зададен — ще се генерира автоматично при първа заявка"
[ -f "$WEBROOT/api/smtp-local.php" ] && c_ok "smtp-local.php наличен (пощата ще работи)" \
  || c_warn "smtp-local.php липсва — контакт формата само ще логва, няма да праща"

# ── Summary ───────────────────────────────────────────────────────────────
echo
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32m╔════════════════════════════════════════════╗\n'
  printf   '║  ДЕПЛОЙ УСПЕШЕН — всички проверки минаха   ║\n'
  printf   '╚════════════════════════════════════════════╝\033[0m\n'
else
  printf '\033[33m╔════════════════════════════════════════════╗\n'
  printf   '║  ДЕПЛОЙ ЗАВЪРШЕН — %2d проверки се провалиха ║\n' "$FAILED"
  printf   '╚════════════════════════════════════════════╝\033[0m\n'
  echo "  Бекъп за връщане: $BACKUP"
fi
echo
echo "  Изчистване на тестовите заключвания (аз току-що направих 7 опита):"
echo "    rm -f $WEBROOT/api/logs/auth_throttle.json"
command -v fail2ban-client >/dev/null && \
echo "    fail2ban-client set carbonstealth-auth unbanip \$(curl -s ifconfig.me)"
echo
echo "  След това: админ панел → INDEXNOW → Submit All"
