#!/usr/bin/env bash
# Linketto (марка Piuma) — HTTPS на piuma.carbonstealth.eu: деплой от main + vhost + сертификат.
# Идемпотентен; спира при първия проблем и казва защо. Пуска се като root:
#
#   curl -fsSL https://raw.githubusercontent.com/stefkostefko92-ux/Few-few/main/linketto/deploy/https-setup.sh -o /root/linketto-https.sh && sudo bash /root/linketto-https.sh
#
# Сваля се във файл и после се пуска (не направо в шела): stdin остава терминалът и нищо не
# чете скрипта като отговор на въпрос.
#
# Защо съществува (17.11.2026): деплоят от main спря на пазача за смяна на ref, vhost-ът дойде
# от стария release (server_name linketto…), а certbot без съвпадащ сайт сложи сертификата
# в conf.d/00-reject-unknown.conf — HTTPS отказваше с „unrecognized name“.
#
# Променливи: LINKETTO_DOMAIN (piuma.carbonstealth.eu) · SKIP_DEPLOY=1 (без стъпка 2).
set -euo pipefail

DOMAIN="${LINKETTO_DOMAIN:-piuma.carbonstealth.eu}"
STATE=/opt/few-few/shared/linketto
ENVF="$STATE/.env"
REJ=/etc/nginx/conf.d/00-reject-unknown.conf
SITE=/etc/nginx/sites-available/linketto
LINK=/etc/nginx/sites-enabled/linketto

say()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
stop() { printf '\033[31mСТОП: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || stop "пусни ме като root (sudo bash $0)."
[ -f "$ENVF" ] || stop "няма $ENVF — linketto още не е разгърнат (DEPLOY.md §7)."
for c in nginx certbot curl; do command -v "$c" >/dev/null 2>&1 || stop "липсва $c."; done
P="$(sed -n 's/^HTTP_PORT=//p' "$ENVF" | tail -1 | tr -dc '0-9' || true)"; P="${P:-4350}"

say "1) Общият блок за непознати домейни не бива да носи $DOMAIN"
if [ -f "$REJ" ] && grep -q "$DOMAIN" "$REJ"; then
  cp -a "$REJ" /root/00-reject-unknown.conf.after-certbot
  certbot rollback --checkpoints 1
  diff /root/00-reject-unknown.conf.after-certbot "$REJ" || true
  grep -q "$DOMAIN" "$REJ" && stop "certbot rollback не махна $DOMAIN от $REJ — копието е в /root/00-reject-unknown.conf.after-certbot; прати ми файла."
  echo "върнат (копие: /root/00-reject-unknown.conf.after-certbot)"
else
  echo "чист"
fi
nginx -t
systemctl reload nginx

if [ "${SKIP_DEPLOY:-0}" != "1" ]; then
  say "2) Деплой от main"
  ALLOW_REF_SWITCH=1 PROJECTS="linketto" bash /opt/few-few/current/deploy/fetch-deploy.sh
fi
curl -fsS "http://127.0.0.1:$P/api/health" || stop "приложението не отговаря на 127.0.0.1:$P."
echo
LG="$(cat "$STATE/last-good" 2>/dev/null || true)"
[ -n "$LG" ] && [ -f "$LG/deploy/nginx.conf" ] || stop "няма last-good release ($STATE/last-good)."
grep -q "server_name $DOMAIN;" "$LG/deploy/nginx.conf" \
  || stop "$LG/deploy/nginx.conf не носи $DOMAIN — деплоят от main мина ли?"

say "3) nginx сайт + сертификат"
sed "s/127\.0\.0\.1:4350/127.0.0.1:$P/g" "$LG/deploy/nginx.conf" > "$SITE"
ln -sfn "$SITE" "$LINK"
nginx -t
systemctl reload nginx
grep -q "server_name $DOMAIN;" "$LINK" || stop "$LINK не носи $DOMAIN."
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  # Сертификатът вече е издаден — само се слага в правилния сайт (без нов, без въпрос за акаунт).
  certbot install --nginx --cert-name "$DOMAIN" --redirect --non-interactive
else
  stop "няма сертификат за $DOMAIN — пусни: certbot --nginx -d $DOMAIN --redirect (сайтът вече е готов)."
fi
nginx -t
systemctl reload nginx
grep -q "$DOMAIN" "$REJ" 2>/dev/null && stop "certbot пак пипна $REJ — прати ми изхода."

say "4) Проверка"
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/" || true)"
echo "https://$DOMAIN/ → HTTP $code"
case "$code" in 2*|3*) ;; *) stop "HTTPS още не отговаря (код $code)." ;; esac
if curl -fsS --max-time 15 "https://$DOMAIN/indexnow-key.txt" >/dev/null 2>&1; then
  (cd "$LG/.." && node tools/seo/indexnow.mjs "https://$DOMAIN" --key-file linketto/public/indexnow-key.txt) \
    || echo "IndexNow не мина — не е критично, пусни го по-късно."
fi
say "ГОТОВО — https://$DOMAIN"
