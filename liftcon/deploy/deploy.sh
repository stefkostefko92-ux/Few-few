#!/usr/bin/env bash
# LiftCon — деплой на VPS-а (netcup). Пуска се НА сървъра от разархивирания release (папката liftcon/):
#   sudo DOMAIN=liftcon.it bash liftcon/deploy/deploy.sh             # пълен деплой
#   sudo bash liftcon/deploy/deploy.sh --solo-env                    # само .env (генерира липсващите тайни)
#   sudo bash liftcon/deploy/deploy.sh --admin                       # само първият администратор на панела
# Идемпотентен: .env (тайните се генерират, ако липсват; съществуващите не се пипат) → бекъп на базата и на
# сайта → базова версия на сайта от репото → база + приложение (Docker; приложението прилага миграциите и
# публикува сайта с промените от панела) → Nginx → проверки → първият администратор (пита за имейл и парола,
# само ако панелът няма потребители). При провал всичко се връща: сайтът (връзката current), Nginx конфигът
# и образът на приложението. Тайните са в $STATE/.env (mode 600), не в архива.
set -euo pipefail

MODE="deploy"
case "${1:-}" in
  "") ;;
  --solo-env) MODE="env" ;;
  --admin) MODE="admin" ;;
  *) printf 'употреба: deploy.sh [--solo-env | --admin]\n' >&2; exit 2 ;;
esac

DOMAIN="${DOMAIN:-liftcon.it}"
PORT="${LIFTCON_HTTP_PORT:-4370}"
STATE="${LIFTCON_STATE_DIR:-/opt/few-few/shared/liftcon}"
ENV_FILE="$STATE/.env"
WEB_ROOT="/var/www/$DOMAIN"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
SNIPPET="/etc/nginx/snippets/liftcon-headers.conf"
SNIPPET_ADMIN="/etc/nginx/snippets/liftcon-headers-admin.conf"
DATA_DIR="$STATE/data" # снимките и PDF-ите на документите (том на приложението)
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(dirname "$HERE")"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
NODE_UID=1000         # потребителят node в образа
DB_VOLUME="liftcon_db-data" # томът на базата (проект „liftcon“ + volume „db-data“ в docker-compose.yml)

log() { printf '[liftcon] %s\n' "$*"; }
die() { printf '[liftcon] ГРЕШКА: %s\n' "$*" >&2; exit 1; }
compose() { LIFTCON_ENV_FILE="$ENV_FILE" LIFTCON_HTTP_PORT="$PORT" LIFTCON_SITE_DIR="$WEB_ROOT" LIFTCON_DATA_DIR="$DATA_DIR" docker compose --env-file "$ENV_FILE" -f "$APP/docker-compose.yml" -p liftcon "$@"; }
need() { for c in "$@"; do command -v "$c" >/dev/null || die "липсва командата $c"; done; }

# --- .env: стойност на ключ / запис на ключ (атомарно, права 600; стойностите не се показват никъде) ---
valore_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- || true; }
imposta_env() {
  local tmp
  tmp="$(mktemp "$STATE/.env.XXXXXX")"
  { grep -vE "^$1=" "$ENV_FILE" || true; printf '%s=%s\n' "$1" "$2"; } >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$ENV_FILE"
}

# Тайните, които могат да се генерират, се генерират (openssl rand); съществуващите никога не се сменят.
# POSTGRES_PASSWORD и SEAL_KEY — само за нова база: при съществуващ том нова стойност би заключила базата
# и шифрованите 2FA тайни и ключа за Brevo → спиране без промени (спецификация т. 18а).
assicura_env() {
  mkdir -p "$STATE"
  chmod 700 "$STATE"
  if [[ ! -f "$ENV_FILE" ]]; then
    (
      umask 077
      cat >"$ENV_FILE" <<ENV
# LiftCon — създаден от deploy.sh ($TS). Тайните са генерирани автоматично: пазете копие на този файл на
# сигурно място (без SEAL_KEY 2FA тайните и ключът за Brevo в базата не могат да се дешифрират).
# Brevo се настройва от панела: /admin/impostazioni (тук — само по желание, като резерва).
ALLOWED_ORIGIN=https://$DOMAIN
MAIL_FROM_NAME=LiftCon
MAIL_TO=info@$DOMAIN
LOG_LEVEL=info
ENV
    )
    log "създаден $ENV_FILE (права 600)"
  fi
  [[ "$(stat -c %a "$ENV_FILE")" == "600" ]] || die "$ENV_FILE трябва да е с права 600 (chmod 600 $ENV_FILE)"
  local db_esiste=0 nuovi=() k
  if docker volume inspect "$DB_VOLUME" >/dev/null 2>&1; then db_esiste=1; fi
  for k in POSTGRES_PASSWORD SEAL_KEY; do
    if [[ -z "$(valore_env "$k")" && "$db_esiste" == 1 ]]; then
      die "в $ENV_FILE липсва $k, а базата вече съществува (том $DB_VOLUME): нова стойност би я заключила. Върнете стойността от копието на .env."
    fi
  done
  if [[ -z "$(valore_env POSTGRES_PASSWORD)" ]]; then imposta_env POSTGRES_PASSWORD "$(openssl rand -hex 32)"; nuovi+=(POSTGRES_PASSWORD); fi
  if [[ -z "$(valore_env SEAL_KEY)" ]]; then imposta_env SEAL_KEY "$(openssl rand -hex 32)"; nuovi+=(SEAL_KEY); fi
  # JWT_SECRET може да се генерира и при съществуваща база: само изписва всички от панела.
  if [[ -z "$(valore_env JWT_SECRET)" ]]; then imposta_env JWT_SECRET "$(openssl rand -hex 48)"; nuovi+=(JWT_SECRET); fi
  if ((${#nuovi[@]})); then log "генерирани: ${nuovi[*]} — запазете копие на $ENV_FILE на сигурно място (password manager)"; fi
  return 0
}

# Първият администратор (MASTER) — само ако панелът няма потребители. Пита в терминала за имейл и парола
# (скрито, два пъти); паролата минава през stdin към командата в контейнера — не се пише в .env, в лога или в
# аргументите на процес (спецификация т. 18). В режим --admin неуспехът е грешка; при деплой — предупреждение.
primo_admin() {
  local n tentativo email pw pw2 rc
  n="$(compose exec -T api node dist/cli/primo-admin.js conta 2>/dev/null | tr -dc '0-9')" || n=""
  if [[ -z "$n" ]]; then
    log "ВНИМАНИЕ: не мога да проверя потребителите на панела. Нов опит: sudo bash $HERE/deploy.sh --admin"
    [[ "$MODE" != admin ]] || exit 1
    return 0
  fi
  if [[ "$n" != 0 ]]; then
    [[ "$MODE" != admin ]] || log "панелът вече има потребители ($n) — първият администратор не се създава отново"
    return 0
  fi
  if [[ ! -t 0 ]]; then
    log "ВНИМАНИЕ: панелът няма администратор, а тук няма терминал за въвеждане. Пуснете: sudo bash $HERE/deploy.sh --admin"
    [[ "$MODE" != admin ]] || exit 1
    return 0
  fi
  log "Първият администратор на панела https://$DOMAIN/admin (роля MASTER)."
  log "Паролата: поне 12 знака, най-добре фраза от няколко думи. Пази се само като хеш (argon2id) в базата."
  for tentativo in 1 2 3; do
    read -r -p "Имейл на администратора: " email || break
    IFS= read -r -s -p "Парола: " pw || break
    printf '\n'
    IFS= read -r -s -p "Повторете паролата: " pw2 || break
    printf '\n'
    if [[ "$pw" != "$pw2" ]]; then
      log "паролите не съвпадат (опит $tentativo от 3)"
      continue
    fi
    rc=0
    printf '%s\n%s\n' "$email" "$pw" | compose exec -T api node dist/cli/primo-admin.js crea || rc=$?
    pw=""
    pw2=""
    case "$rc" in
      0) log "вход: https://$DOMAIN/admin — при първия вход се настройва 2FA (приложение за кодове)"; return 0 ;;
      3) return 0 ;;
      2) log "опит $tentativo от 3" ;;
      *) break ;;
    esac
  done
  pw=""
  pw2=""
  log "ВНИМАНИЕ: администраторът не е създаден. Нов опит: sudo bash $HERE/deploy.sh --admin"
  [[ "$MODE" != admin ]] || exit 1
  return 0
}

[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "невалиден DOMAIN: $DOMAIN"

if [[ "$MODE" == env ]]; then
  need docker openssl
  docker info >/dev/null 2>&1 || die "Docker не работи"
  assicura_env
  log "готово: $ENV_FILE"
  exit 0
fi

if [[ "$MODE" == admin ]]; then
  need docker
  [[ -f "$ENV_FILE" ]] || die "липсва $ENV_FILE — първо пълен деплой"
  docker ps --format '{{.Names}}' | grep -q '^liftcon-api$' || die "приложението (liftcon-api) не работи — първо пълен деплой"
  primo_admin
  exit 0
fi

need nginx docker curl certbot ss tar gzip openssl
[[ -f "$APP/public/index.html" ]] || die "няма $APP/public/index.html — грешен архив?"
docker info >/dev/null 2>&1 || die "Docker не работи"
assicura_env

# Портът: свободен или вече държан от нашия контейнер.
if ss -tlnH "sport = :$PORT" | grep -q .; then
  docker ps --format '{{.Names}} {{.Ports}}' | grep -q "^liftcon-api .*127.0.0.1:$PORT->" || die "порт $PORT е зает от друг процес"
fi

mkdir -p "$STATE/backup" "$WEB_ROOT/releases" "$DATA_DIR"
chmod 700 "$STATE"
# Приложението (потребител node) пише снимките и PDF-ите; никой друг не ги чете.
chown "$NODE_UID:$NODE_UID" "$DATA_DIR" && chmod 700 "$DATA_DIR"

# 1. Бекъп на базата (преди миграциите) и запомняне на активната версия на сайта.
if docker ps --format '{{.Names}}' | grep -q '^liftcon-db-1$'; then
  compose exec -T db pg_dump -U liftcon -d liftcon --no-owner | gzip >"$STATE/backup/db-$TS.sql.gz"
  log "бекъп на базата: $STATE/backup/db-$TS.sql.gz"
fi
ls -1t "$STATE"/backup/db-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f || true
# Снимките и PDF-ите на документите: архив при всеки деплой (пазят се последните 3 — могат да са големи).
if [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
  tar -czf "$STATE/backup/data-$TS.tar.gz" -C "$STATE" data
  log "бекъп на документите: $STATE/backup/data-$TS.tar.gz"
fi
ls -1t "$STATE"/backup/data-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f || true
PREV_TARGET="$(readlink "$WEB_ROOT/current" 2>/dev/null || true)"

rollback() {
  if [[ -n "$PREV_TARGET" ]]; then
    ln -sfn "$PREV_TARGET" "$WEB_ROOT/current.tmp" && mv -Tf "$WEB_ROOT/current.tmp" "$WEB_ROOT/current"
    log "ОТКАТ: сайтът сочи пак $PREV_TARGET"
  fi
  if [[ -f "$NGINX_CONF.prev" ]]; then mv -f "$NGINX_CONF.prev" "$NGINX_CONF"; fi
  if [[ -f "$SNIPPET.prev" ]]; then mv -f "$SNIPPET.prev" "$SNIPPET"; fi
  if [[ -f "$SNIPPET_ADMIN.prev" ]]; then mv -f "$SNIPPET_ADMIN.prev" "$SNIPPET_ADMIN"; fi
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
if [[ -f "$SNIPPET_ADMIN" ]]; then cp -a "$SNIPPET_ADMIN" "$SNIPPET_ADMIN.prev"; fi
if [[ -f "$NGINX_CONF" ]]; then cp -a "$NGINX_CONF" "$NGINX_CONF.prev"; fi
install -m 644 "$HERE/liftcon-headers.conf" "$SNIPPET"
install -m 644 "$HERE/liftcon-headers-admin.conf" "$SNIPPET_ADMIN"
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
rm -f "$NGINX_CONF.prev" "$SNIPPET.prev" "$SNIPPET_ADMIN.prev"
# Старите версии на сайта: пазят се последните 5 (освен активната).
active="$(readlink "$WEB_ROOT/current")"
ls -1dt "$WEB_ROOT"/releases/* 2>/dev/null | grep -v "/${active#releases/}$" | tail -n +6 | xargs -r rm -rf || true
log "health 200: https://$DOMAIN/health, https://$DOMAIN/ и https://$DOMAIN/admin/login (активна версия: $active)"

# 7. Първият администратор (само ако панелът няма потребители).
primo_admin

# 8. IndexNow (Bing, Yandex, Seznam, Naver, Yep) — по желание: INDEXNOW=1.
if [[ "${INDEXNOW:-0}" == "1" && -f "$APP/../tools/seo/indexnow.mjs" ]]; then
  node "$APP/../tools/seo/indexnow.mjs" "https://$DOMAIN" || log "IndexNow не мина (сайтът е жив; пуснете го ръчно)"
fi
log "готово"
