#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# korpora/deploy/deploy.sh — разгръща Korpora от тази папка на release-а (Docker Compose).
#
#   sudo bash /opt/few-few/current/korpora/deploy/deploy.sh    # ръчно (DEPLOY.md)
#   deploy/autodeploy.sh го вика за всеки release с korpora/    # автоматично — същият път
#
# Ред: тайните от стабилния път → build → новият образ отваря каталога с ключа → бекъп на базата преди
# миграция (след build-а: дъмпът е отпреди самата смяна, не губи записите от минутите на build-а) → up
# (entrypoint-ът прилага `prisma migrate deploy`) → чака, докато на порта отговори именно Korpora →
# таймерът на дневния шифрован бекъп → vhost-ът от репото, щом има сертификат → IndexNow при нов sitemap.
#
# Тайни не се измислят. Изход: 0 — жив; 3 — няма .env (машината не е настроена); 4 — контейнерите са
# сменени, но Korpora не отговаря (autodeploy връща предишния код); 1 — спрян преди смяната (работещите
# не са пипани). След успешната сонда нищо не сменя изхода 0: бекъпът, nginx и IndexNow предупреждават.
#
# KORPORA_SKIP_BACKUP=1 — без нов дъмп (откатът на autodeploy): иначе всеки провал гори слот от
# ротацията и изтласква дъмпа отпреди счупената миграция.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="${KORPORA_SHARED:-/opt/few-few/shared/korpora}"
DOMAIN="${KORPORA_DOMAIN:-korpora.carbonstealth.eu}"
NGINX_SITE="${KORPORA_NGINX_SITE:-/etc/nginx/sites-available/korpora}"
NGINX_LINK="${KORPORA_NGINX_LINK:-/etc/nginx/sites-enabled/korpora}"
LE_DIR="${KORPORA_LE_DIR:-/etc/letsencrypt}"
HEALTH_WAIT="${KORPORA_HEALTH_WAIT:-90}"
KEEP_BACKUPS="${KORPORA_KEEP_BACKUPS:-5}"
# дъмповете преди миграция живеят най-много толкова седмици — колкото дневните бекъпи (backup.sh)
BACKUP_WEEKS="${KORPORA_BACKUP_WEEKLY:-8}"
INDEXNOW="${KORPORA_INDEXNOW:-1}"
SKIP_BACKUP="${KORPORA_SKIP_BACKUP:-0}"
LAST_GOOD="${KORPORA_LAST_GOOD:-$SHARED/last-good}"
TS="$(date +%Y%m%d-%H%M%S)"

log()  { printf '\033[1;36m▸ korpora: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ korpora: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ korpora: %s\033[0m\n' "$*" >&2; }
fail() {
  local code="$1"
  shift
  printf '\033[31m✘ korpora: %s\033[0m\n' "$*" >&2
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
  data="$(env_value KORPORA_DATA)"
  if [ "$data" != "$SHARED/data" ]; then
    fail 1 "KORPORA_DATA в .env трябва да е $SHARED/data (сега: ${data:-празно}) — каталогът, GeoIP базата и котвата на одита не бива да остават в release-а."
  fi
  # uid 1000 = node в образа; това е единствената папка, в която приложението пише
  install -d -m 700 -o 1000 -g 1000 "$data"
}

# POSTGRES_PASSWORD влиза некодирана в DATABASE_URL (docker-compose.yml): „/“, „?“, „#“ и „%“ чупят
# адреса и приложението никога не стига до базата. По-добре отказ сега, отколкото сонда и откат.
check_db_password() {
  case "$(env_value POSTGRES_PASSWORD)" in
    *[/?#%]*) fail 1 "POSTGRES_PASSWORD съдържа някой от знаците / ? # % — те чупят DATABASE_URL. Нова: openssl rand -hex 32 (DEPLOY.md, т. 1)." ;;
  esac
}

# Бекъп ПРЕДИ миграцията, щом томът с базата съществува (при пръв деплой няма какво). Тече след
# build-а, точно преди `up`: възстановяването губи само секундите до смяната, не минутите на build-а.
# Без бекъп няма миграция: провалът тук спира деплоя, преди контейнерът на приложението да е сменен.
# Дъмпът е с --clean --if-exists: възстановява се в съществуващата база (DEPLOY.md, т. 8).
# Има ли база за бекъп — решава се ПРЕДИ проверката на каталога: `docker compose run` създава томовете на
# проекта и след нея всеки пръв деплой би изглеждал като повторен (бекъп на празна база). Самият дъмп е
# след проверката — грешен ключ не гори място в ротацията.
BACKUP_PLAN=""
plan_backup() {
  if [ "$SKIP_BACKUP" = "1" ]; then
    BACKUP_PLAN=skip
  elif docker volume inspect korpora_db-data >/dev/null 2>&1; then
    BACKUP_PLAN=dump
  else
    BACKUP_PLAN=first
  fi
}

backup_db() {
  case "$BACKUP_PLAN" in
    skip)
      log "KORPORA_SKIP_BACKUP=1 (откат) — без нов бекъп; последният дъмп отпреди миграцията остава"
      return 0
      ;;
    first)
      log "няма том с база (пръв деплой) — няма какво да се бекъпва"
      return 0
      ;;
    dump) ;;
    *) fail 1 "бекъпът няма план (plan_backup не е минал) — не мигрирам без бекъп." ;;
  esac
  local dir="$SHARED/backups" file
  file="$dir/pre-deploy-$TS.sql.gz"
  install -d -m 700 "$dir"
  # базата може да е спряна (рестарт на машината, срив) — вдига се само тя, за да се дъмпне. Без
  # --no-recreate compose би пресъздал работещата база по дефиницията на НОВИЯ release още тук, преди
  # бекъпа; новата дефиниция влиза едва с `up` след него.
  docker compose up -d --no-recreate --wait db >/dev/null ||
    fail 1 "базата не тръгна за бекъпа — не мигрирам без бекъп."
  if docker compose exec -T db pg_dump --clean --if-exists -U korpora -d korpora | gzip >"$file.partial"; then
    mv -f "$file.partial" "$file"
    ok "бекъп преди миграция → $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    fail 1 "бекъпът преди миграция се провали — не мигрирам без бекъп."
  fi
  find "$dir" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' | sort -rn |
    tail -n "+$((KEEP_BACKUPS + 1))" | cut -d' ' -f2- | xargs -r rm -f
  # и не по-стари от $BACKUP_WEEKS седмици без един ден, както в backup.sh: изтрит акаунт не остава в
  # некриптиран дъмп по-дълго, отколкото казва политиката, и когато деплоите са редки (между тях ги трие
  # дневният бекъп)
  find "$dir" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -mmin "+$(((BACKUP_WEEKS * 7 - 1) * 1440))" -delete ||
    warn "старите дъмпове в $dir не се изтриха докрай — провери правата"
}

# Код 200 сам не казва КОЙ отговаря на порта: чака се маркерът на Korpora и база, която отговаря.
# Каталогът от магазините е в репото шифрован (sealed/catalog.json.enc); CATALOG_KEY е само в .env. Новият
# образ го отваря ПРЕДИ смяната: грешен ключ или повреден файл спира деплоя тук (код 1), докато старите
# контейнери още работят — иначе новият код не би тръгнал. Без CATALOG_KEY няма какво да се проверява.
check_catalog() {
  [ -n "$(env_value CATALOG_KEY)" ] || return 0
  docker compose run --rm --no-deps --entrypoint node app dist/scripts/catalog-check.js ||
    fail 1 "каталогът от репото не се отваря с CATALOG_KEY от .env — работещите контейнери не са пипани. Провери ключа (DEPLOY.md, т. 1)."
}

wait_healthy() {
  local url="http://127.0.0.1:$1/health" body deadline=$((SECONDS + HEALTH_WAIT))
  while :; do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null)" || body=""
    case "$body" in *'"app":"korpora"'*)
      case "$body" in *'"status":"ok"'*) return 0 ;; esac
      ;;
    esac
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep 3
  done
}

# Последният release, който е отговорил — целта на отката и папката за командите от DEPLOY.md. Пише
# се и при ръчен деплой; истинският път (без symlink-а current), за да не се мести сам.
remember_live() {
  local real
  real="$(cd "$APP_DIR" && pwd -P)" && install -d -m 700 "$(dirname "$LAST_GOOD")" &&
    printf '%s\n' "$real" >"$LAST_GOOD.tmp" && mv -f "$LAST_GOOD.tmp" "$LAST_GOOD"
}

# Vhost-ът е файл в репото: щом има сертификат, сървърът носи точно него, с порта от HTTP_PORT (nginx -t,
# после reload; при грешка се връща старият). Сертификатът се взема веднъж на ръка, когато DNS вече
# сочи насам. Тече след сондата: всяка грешка е предупреждение и код ≠ 0 само към main.
sync_nginx() {
  local port="$1" conf="$APP_DIR/deploy/nginx/$DOMAIN.conf" bak="$NGINX_SITE.bak-$TS" new renewal why=""
  if ! command -v nginx >/dev/null 2>&1; then
    warn "няма nginx на хоста — Korpora отговаря само на 127.0.0.1:$port"
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
  # vhost-ът в репото е за 127.0.0.1:4320; друг HTTP_PORT се вписва тук — иначе домейнът би сочил порт,
  # на който не е Korpora (чуждо приложение или 502)
  new="$(mktemp)" || return 1
  sed "s/127\.0\.0\.1:4320;/127.0.0.1:$port;/g" "$conf" >"$new"
  if ! grep -q "127.0.0.1:$port;" "$new"; then
    rm -f "$new"
    warn "vhost-ът в репото не сочи 127.0.0.1:4320 — nginx не е пипан"
    return 1
  fi
  # подновеният сертификат стига до nginx само след reload: кука на сертификата, nginx като installer
  # или изпълним файл в renewal-hooks/deploy (certbot го пуска след всяко подновяване)
  renewal="$LE_DIR/renewal/$DOMAIN.conf"
  if [ -f "$renewal" ] && ! grep -qE '^(renew_hook *=|installer *= *nginx)' "$renewal" &&
    [ -z "$(find "$LE_DIR/renewal-hooks/deploy" -type f -perm -u+x 2>/dev/null)" ]; then
    warn "certbot не презарежда nginx след подновяване — новият сертификат ще стигне до nginx чак при следващ reload."
  fi
  if [ -f "$NGINX_SITE" ] && cmp -s "$new" "$NGINX_SITE" && [ "$(readlink "$NGINX_LINK" || true)" = "$NGINX_SITE" ]; then
    rm -f "$new"
    return 0
  fi
  if [ -f "$NGINX_SITE" ] && ! cp -a "$NGINX_SITE" "$bak"; then
    rm -f "$new"
    warn "старият vhost не се запази в $bak — nginx не е пипан"
    return 1
  fi
  { install -m 644 "$new" "$NGINX_SITE" && ln -sfn "$NGINX_SITE" "$NGINX_LINK"; } || why="vhost-ът не се записа в $NGINX_SITE"
  [ -n "$why" ] || nginx -t >/dev/null 2>&1 || why="nginx -t отказа новия vhost (виж: nginx -t)"
  # неуспешен reload (напр. неактивен nginx) оставя заредения стар конфиг — затова и на диска се връща
  # старият, а следващият деплой опитва пак
  [ -n "$why" ] || systemctl reload nginx || why="reload на nginx не мина (виж: systemctl status nginx)"
  rm -f "$new"
  if [ -z "$why" ]; then
    rm -f "$bak"
    ok "nginx носи vhost-а от репото ($NGINX_SITE)"
    return 0
  fi
  if [ -f "$bak" ]; then mv -f "$bak" "$NGINX_SITE"; else rm -f "$NGINX_SITE" "$NGINX_LINK"; fi
  warn "$why — върнах стария vhost; следващият деплой опитва пак."
  return 1
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
  if [ ! -f "$(env_value KORPORA_DATA)/dbip-country-lite.mmdb" ]; then
    warn "няма GeoIP база — държавата при вход ще е празна. Веднъж, после месечно (DEPLOY.md, т. 4):"
    warn "  cd $APP_DIR && docker compose exec -T app node dist/scripts/geoip-update.js && docker compose restart app"
  fi
  users="$(docker compose exec -T db psql -U korpora -d korpora -tAc 'SELECT count(*) FROM "User"' 2>/dev/null | tr -dc '0-9')" || users=""
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
  check_db_password
  port="$(env_value HTTP_PORT | tr -dc '0-9')"
  port="${port:-4320}"
  log "build…"
  docker compose build app || fail 1 "build се провали — работещите контейнери не са пипани."
  plan_backup
  check_catalog
  backup_db
  log "up (entrypoint-ът прилага миграциите)…"
  docker compose up -d --remove-orphans || fail 4 "docker compose up се провали."
  wait_healthy "$port" ||
    fail 4 "на 127.0.0.1:$port не отговаря Korpora след ${HEALTH_WAIT} s. Виж: cd $APP_DIR && docker compose logs --tail=80 app"
  ok "жив на 127.0.0.1:$port"
  # Новият код вече работи: оттук нататък нищо не сменя изхода 0 (за autodeploy 1 значи „спрян преди
  # смяната“, а това вече не е вярно).
  remember_live || warn "не записах $LAST_GOOD — откатът и DEPLOY.md сочат предишния release"
  (source "$APP_DIR/deploy/backup-install.sh" && install_backup) || warn "дневният шифрован бекъп не е готов — DEPLOY.md, т. 9"
  sync_nginx "$port" || warn "nginx не е обновен — Korpora е жив на 127.0.0.1:$port"
  ping_indexnow "$port" || warn "IndexNow не мина — следващият деплой опитва пак"
  hints || true
}

# Изпълнен — разгръща; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
