#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rendetto/deploy/deploy.sh — разгръща Rendetto от тази папка на release-а (Docker Compose).
#
#   sudo bash /opt/few-few/current/rendetto/deploy/deploy.sh    # ръчно (DEPLOY.md)
#   deploy/autodeploy.sh го вика за всеки release с rendetto/    # автоматично — същият път
#
# Ред: тайните от стабилния път → бекъп на базата преди миграция → build → up (entrypoint-ът
# прилага `prisma migrate deploy`) → чака, докато на порта отговори именно Rendetto → nginx
# vhost-ът от репото, щом има сертификат → IndexNow, само ако sitemap-ът се е променил.
#
# Тайни не се измислят. Изход: 0 — жив; 3 — няма .env (машината не е настроена);
# 4 — контейнерите са сменени, но Rendetto не отговаря (autodeploy връща предишния код);
# 1 — спрян преди смяната на контейнерите (работещите не са пипани). Идемпотентен.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="${RENDETTO_SHARED:-/opt/few-few/shared/rendetto}"
DOMAIN="${RENDETTO_DOMAIN:-rendetto.carbonstealth.eu}"
NGINX_SITE="${RENDETTO_NGINX_SITE:-/etc/nginx/sites-available/rendetto}"
NGINX_LINK="${RENDETTO_NGINX_LINK:-/etc/nginx/sites-enabled/rendetto}"
LE_DIR="${RENDETTO_LE_DIR:-/etc/letsencrypt}"
HEALTH_WAIT="${RENDETTO_HEALTH_WAIT:-90}"
KEEP_BACKUPS="${RENDETTO_KEEP_BACKUPS:-5}"
INDEXNOW="${RENDETTO_INDEXNOW:-1}"
TS="$(date +%Y%m%d-%H%M%S)"

log()  { printf '\033[1;36m▸ rendetto: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ rendetto: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ rendetto: %s\033[0m\n' "$*" >&2; }
fail() {
  local code="$1"
  shift
  printf '\033[31m✘ rendetto: %s\033[0m\n' "$*" >&2
  exit "$code"
}

# Стойност от .env, без файлът да се изпълнява (`source` би пуснал всеки ред като код). Не се печата.
env_value() {
  local v
  v="$(sed -n "s/^$1=//p" "$APP_DIR/.env" | tail -n 1 | tr -d '\r')" || v=""
  v="${v%\"}" && v="${v#\"}" && v="${v%\'}" && v="${v#\'}"
  printf '%s' "$v"
}

# Тайните живеят в $SHARED/.env (mode 600) и оттам влизат във всеки release — редактира се там.
# Папката е 700 при всеки пробег: в нея са и бекъпите на базата.
sync_env() {
  if [ -f "$SHARED/.env" ]; then
    install -d -m 700 "$SHARED"
    install -m 600 "$SHARED/.env" "$APP_DIR/.env"
  elif [ -f "$APP_DIR/.env" ]; then
    install -d -m 700 "$SHARED"
    install -m 600 "$APP_DIR/.env" "$SHARED/.env"
    ok "запазих .env в $SHARED/.env — оттук нататък се редактира там"
  else
    fail 3 "няма $SHARED/.env — тайни не се измислят. Направи го веднъж по DEPLOY.md (т. 1) и пусни пак."
  fi
}

# Каталогът, GeoIP базата и котвата на одита са извън release-а — иначе изчезват със следващия деплой.
ensure_data() {
  local data
  data="$(env_value RENDETTO_DATA)"
  if [ "$data" != "$SHARED/data" ]; then
    fail 1 "RENDETTO_DATA в .env трябва да е $SHARED/data (сега: ${data:-празно}) — каталогът, GeoIP базата и котвата на одита не бива да остават в release-а."
  fi
  # uid 1000 = node в образа; това е единствената папка, в която приложението пише
  install -d -m 700 -o 1000 -g 1000 "$data"
}

# Бекъп ПРЕДИ миграцията, щом томът с базата съществува (при пръв деплой няма какво). Без бекъп няма
# миграция: провалът тук спира деплоя, преди контейнерът на приложението да е сменен.
backup_db() {
  if ! docker volume inspect rendetto_db-data >/dev/null 2>&1; then
    log "няма том с база (пръв деплой) — няма какво да се бекъпва"
    return 0
  fi
  local dir="$SHARED/backups" file
  file="$dir/pre-deploy-$TS.sql.gz"
  install -d -m 700 "$dir"
  # базата може да е спряна (рестарт на машината, срив) — вдига се само тя, за да се дъмпне
  docker compose up -d --wait db >/dev/null || fail 1 "базата не тръгна за бекъпа — не мигрирам без бекъп."
  if docker compose exec -T db pg_dump -U rendetto -d rendetto | gzip >"$file.partial"; then
    mv -f "$file.partial" "$file"
    ok "бекъп преди миграция → $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    fail 1 "бекъпът преди миграция се провали — не мигрирам без бекъп."
  fi
  find "$dir" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' | sort -rn |
    tail -n "+$((KEEP_BACKUPS + 1))" | cut -d' ' -f2- | xargs -r rm -f
}

# Код 200 сам не казва КОЙ отговаря на порта: чака се маркерът на Rendetto и база, която отговаря.
wait_healthy() {
  local url="http://127.0.0.1:$1/health" body deadline=$((SECONDS + HEALTH_WAIT))
  while :; do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null)" || body=""
    case "$body" in *'"app":"rendetto"'*)
      case "$body" in *'"status":"ok"'*) return 0 ;; esac
      ;;
    esac
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep 3
  done
}

# Vhost-ът е файл в репото: щом има сертификат, сървърът носи точно него (nginx -t, после reload; при
# грешка се връща старият). Сертификатът се взема веднъж на ръка, когато DNS вече сочи насам.
sync_nginx() {
  local port="$1" conf="$APP_DIR/deploy/nginx/$DOMAIN.conf" bak="$NGINX_SITE.bak-$TS" renewal
  if ! command -v nginx >/dev/null 2>&1; then
    warn "няма nginx на хоста — Rendetto отговаря само на 127.0.0.1:$port"
    return 0
  fi
  if [ ! -f "$LE_DIR/live/$DOMAIN/fullchain.pem" ]; then
    warn "няма TLS сертификат за $DOMAIN — сайтът още не е публичен. Веднъж, когато DNS сочи насам:"
    warn "  certbot certonly --nginx -d $DOMAIN --deploy-hook 'systemctl reload nginx' && bash $APP_DIR/deploy/deploy.sh"
    return 0
  fi
  if [ ! -f "$conf" ]; then
    warn "няма $conf в release-а — nginx не е пипан"
    return 0
  fi
  grep -q "127.0.0.1:$port;" "$conf" || warn "vhost-ът в репото сочи друг порт, не $port (HTTP_PORT в .env)"
  # подновеният сертификат стига до nginx само след reload: кука на сертификата, nginx като installer
  # или изпълним файл в renewal-hooks/deploy (certbot го пуска след всяко подновяване)
  renewal="$LE_DIR/renewal/$DOMAIN.conf"
  if [ -f "$renewal" ] && ! grep -qE '^(renew_hook *=|installer *= *nginx)' "$renewal" &&
    [ -z "$(find "$LE_DIR/renewal-hooks/deploy" -type f -perm -u+x 2>/dev/null)" ]; then
    warn "certbot не презарежда nginx след подновяване — новият сертификат ще стигне до nginx чак при следващ reload."
  fi
  if [ -f "$NGINX_SITE" ] && cmp -s "$conf" "$NGINX_SITE" && [ "$(readlink "$NGINX_LINK" || true)" = "$NGINX_SITE" ]; then
    return 0
  fi
  if [ -f "$NGINX_SITE" ]; then cp -a "$NGINX_SITE" "$bak"; fi
  install -m 644 "$conf" "$NGINX_SITE"
  ln -sfn "$NGINX_SITE" "$NGINX_LINK"
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    rm -f "$bak"
    ok "nginx носи vhost-а от репото ($NGINX_SITE)"
  else
    if [ -f "$bak" ]; then mv -f "$bak" "$NGINX_SITE"; else rm -f "$NGINX_SITE" "$NGINX_LINK"; fi
    warn "nginx -t отказа новия vhost — върнах стария, nginx не е презареждан. Виж: nginx -t"
  fi
}

# IndexNow (Bing, Yandex, Seznam, Naver, Yep — Google не участва): само когато sitemap-ът се е
# променил, не на всеки деплой. Не е фатално: докато сайтът не е публичен, ключът не се проверява и
# следващият деплой опитва пак.
ping_indexnow() {
  local port="$1" tool="$APP_DIR/../tools/seo/indexnow.mjs" stamp="$SHARED/indexnow-sitemap.sha256" sum site
  [ "$INDEXNOW" = "1" ] || return 0
  if [ ! -f "$tool" ] || ! command -v node >/dev/null 2>&1; then
    warn "IndexNow: няма node или $tool — пропускам"
    return 0
  fi
  if ! sum="$(curl -fsS --max-time 10 "http://127.0.0.1:$port/sitemap.xml" | sha256sum | cut -d' ' -f1)"; then
    warn "IndexNow: sitemap.xml не се чете локално — пропускам"
    return 0
  fi
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$sum" ]; then
    log "IndexNow: sitemap-ът не е променян — няма какво да се подава"
    return 0
  fi
  site="$(env_value PUBLIC_BASE_URL)"
  if node "$tool" "$site"; then
    printf '%s\n' "$sum" >"$stamp"
    ok "IndexNow: подаден е sitemap-ът на $site"
  else
    warn "IndexNow: подаването не мина (сайтът публичен ли е, с TLS?) — следващият деплой опитва пак"
  fi
}

# Еднократните стъпки, които скриптът не прави сам: GeoIP базата и първият собственик.
hints() {
  local users
  if [ ! -f "$(env_value RENDETTO_DATA)/dbip-country-lite.mmdb" ]; then
    warn "няма GeoIP база — държавата при вход ще е празна. Веднъж, после месечно (DEPLOY.md, т. 4):"
    warn "  cd $APP_DIR && docker compose exec -T app node dist/scripts/geoip-update.js && docker compose restart app"
  fi
  users="$(docker compose exec -T db psql -U rendetto -d rendetto -tAc 'SELECT count(*) FROM "User"' 2>/dev/null | tr -dc '0-9')" || users=""
  if [ "$users" = "0" ]; then
    warn "няма нито един акаунт — създай собственика веднъж по DEPLOY.md (т. 5)"
  fi
}

main() {
  local port
  [ "$(id -u)" = "0" ] || fail 1 "пусни като root (sudo)."
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    fail 1 "липсва Docker с compose plugin."
  fi
  cd "$APP_DIR"
  sync_env
  ensure_data
  port="$(env_value HTTP_PORT | tr -dc '0-9')"
  port="${port:-4320}"
  backup_db
  log "build…"
  docker compose build app || fail 1 "build се провали — работещите контейнери не са пипани."
  log "up (entrypoint-ът прилага миграциите)…"
  docker compose up -d --remove-orphans || fail 4 "docker compose up се провали."
  wait_healthy "$port" ||
    fail 4 "на 127.0.0.1:$port не отговаря Rendetto след ${HEALTH_WAIT} s. Виж: cd $APP_DIR && docker compose logs --tail=80 app"
  ok "жив на 127.0.0.1:$port"
  sync_nginx "$port"
  ping_indexnow "$port"
  hints
}

# Изпълнен — разгръща; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
