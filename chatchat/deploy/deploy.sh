#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/deploy.sh — разгръща ChatChat от тази папка на release-а (Docker Compose).
#
#   sudo bash /opt/few-few/current/chatchat/deploy/deploy.sh   # ръчно (DEPLOY.md)
#   deploy/autodeploy.sh го вика за всеки release с chatchat/  # автоматично — същият път
#
# Ред: тайните от стабилния път → шифрованият том на базата, ако е включен (отключен и монтиран, т. 12)
# → папката с прикачените файлове → образите (build на app; db и clamav се теглят само ако ги няма) →
# бекъп на базата преди миграция (след build-а: дъмпът е отпреди самата смяна) → еднократно: базата на
# pgvector + REINDEX (DEPLOY.md, т. 11) → up (entrypoint-ът прилага `prisma migrate deploy`) → чака
# /readyz → старите нешифровани прикачени файлове се шифроват (`files:encrypt`) → дневният шифрован
# бекъп и ретенцията (таймери) → vhost-ът от репото, щом има сертификат.
#
# Изход: 0 — жив; 3 — няма .env (машината не е настроена); 4 — контейнерите са сменени, но ChatChat не
# отговаря (autodeploy връща предишния код); 1 — спрян преди смяната (работещите не са пипани). След
# успешната сонда нищо не сменя изхода 0: таймерите и nginx само предупреждават.
#
# CHATCHAT_SKIP_BACKUP=1 — без нов дъмп (откатът на autodeploy): иначе всеки провал гори слот от
# ротацията и изтласква дъмпа отпреди счупената миграция.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="${CHATCHAT_SHARED:-/opt/few-few/shared/chatchat}"
DOMAIN="${CHATCHAT_DOMAIN:-chatchat.carbonstealth.eu}"
NGINX_SITE="${CHATCHAT_NGINX_SITE:-/etc/nginx/sites-available/chatchat}"
NGINX_LINK="${CHATCHAT_NGINX_LINK:-/etc/nginx/sites-enabled/chatchat}"
LE_DIR="${CHATCHAT_LE_DIR:-/etc/letsencrypt}"
HEALTH_WAIT="${CHATCHAT_HEALTH_WAIT:-120}"
KEEP_BACKUPS="${CHATCHAT_KEEP_BACKUPS:-5}"
SKIP_BACKUP="${CHATCHAT_SKIP_BACKUP:-0}"
LAST_GOOD="${CHATCHAT_LAST_GOOD:-$SHARED/last-good}"
# Маркер: томът на базата вече е минал на pgvector (glibc) и индексите са построени наново.
PGVECTOR_MARK="${CHATCHAT_PGVECTOR_MARK:-$SHARED/.db-pgvector}"
# Шифрованият том на базата (deploy/pgdata-encrypt.sh, DEPLOY.md т. 12): конфигът е на root, извън release-а.
PGDATA_CONF="${CHATCHAT_PGDATA_CONF_DIR:-/etc/chatchat}/pgdata.conf"
PGDATA_MOUNT="$SHARED/pgdata"
COMPOSE_PGDATA='COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml'
TS="$(date +%Y%m%d-%H%M%S)"
# Средата. Продукцията е винаги compose проектът `chatchat` (`name:` в docker-compose.yml) — наследен
# COMPOSE_PROJECT_NAME не я отклонява. Staging идва САМО през deploy/staging.sh: CHATCHAT_STAGING=1 +
# COMPOSE_PROJECT_NAME=chatchat-staging + отделните пътища (DEPLOY.md, „Staging“); без таймерите на
# продукцията (unit-ите им са с фиксирани имена) и без шифрования том.
STAGING="${CHATCHAT_STAGING:-0}"
if [ "$STAGING" = 1 ]; then
  PROJECT="${COMPOSE_PROJECT_NAME:-}"
else
  PROJECT=chatchat
  unset COMPOSE_PROJECT_NAME
fi

log()  { printf '\033[1;36m▸ chatchat: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ chatchat: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ chatchat: %s\033[0m\n' "$*" >&2; }
fail() {
  local code="$1"
  shift
  printf '\033[31m✘ chatchat: %s\033[0m\n' "$*" >&2
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
# Папката е 700 при всеки пробег: в нея са и бекъпите, и прикачените файлове.
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

# Ключовете (подписът на адресите за сваляне, шифроването на MFA, главният ключ на файловете FILES_KEK и
# тайните на helpdesk конекторите INTEGRATION_KEK и SSO_KEK за client secret на доставчиците на единния
# вход) са чисто случайни: щом ги няма, приложението не е тръгвало с тях (compose иска първите три с
# `:?`; без INTEGRATION_KEK/SSO_KEK съответната функция е изключена), тоест няма нищо, подписано или
# шифровано с тях. Затова тук — и само тук — липсващ ключ се ражда на сървъра:
# дописва се в $SHARED/.env (600), никога не се презаписва, никога не се печата. Съществуващ не се пипа.
# Изгубен SSO_KEK не губи данни: администраторът въвежда секрета на доставчика наново (sso:off при нужда).
ensure_keys() {
  local name added=""
  for name in ATTACHMENT_URL_KEY MFA_ENC_KEY FILES_KEK INTEGRATION_KEK SSO_KEK; do
    [ -z "$(env_value "$name")" ] || continue
    if [ "$name" = FILES_KEK ] && sealed_files_exist; then
      fail 1 "FILES_KEK липсва в $SHARED/.env, а в attachments/ има шифровани файлове — нов ключ НЕ ги отваря. Върни ключа от password manager-а (docs/runbook.md, „Изгубен FILES_KEK“)."
    fi
    command -v openssl >/dev/null 2>&1 || fail 1 "липсва $name в $SHARED/.env, а openssl го няма — сложи го ръчно (DEPLOY.md, т. 1)."
    # пренасочването е на същия ред: стойността отива само във файла
    printf '%s=%s\n' "$name" "$(openssl rand -base64 32)" >>"$SHARED/.env"
    added="$added $name"
  done
  [ -n "$added" ] || return 0
  chmod 600 "$SHARED/.env"
  install -m 600 "$SHARED/.env" "$APP_DIR/.env"
  warn "генерирах$added в $SHARED/.env — копирай .env и извън сървъра СЕГА (без MFA_ENC_KEY MFA устройствата се записват наново; без FILES_KEK прикачените файлове — и в бекъпите — са загубени; без INTEGRATION_KEK токените на helpdesk конектора се въвеждат наново)."
}

# Има ли вече шифровани файлове (магията на src/storage/envelope.ts) — тогава FILES_KEK не се ражда наново.
sealed_files_exist() {
  local f
  while IFS= read -r -d '' f; do
    [ "$(head -c 8 "$f" | od -An -tx1 | tr -d ' \n')" = 894343454e430d0a ] && return 0
  done < <(find "$SHARED/attachments" -type f -size +96c -print0 2>/dev/null | head -z -n 200)
  return 1
}

# Кой compose проект пипа този пробег — проверено ПРЕДИ първата docker команда. Staging: само
# `chatchat-staging`, със собствена папка, и .env, който казва същото (ръчните `docker compose` от
# папката му отиват там). Продукцията: .env без чуждо COMPOSE_PROJECT_NAME — то би бутнало compose
# към друг проект (напр. копиран .env на staging) въпреки `name: chatchat`.
check_project() {
  local named
  named="$(env_value COMPOSE_PROJECT_NAME)"
  if [ "$STAGING" != 1 ]; then
    [ -z "$named" ] || [ "$named" = chatchat ] ||
      fail 1 "COMPOSE_PROJECT_NAME=$named в $SHARED/.env — това не е .env на продукцията (staging ли е?). Не пипам нищо."
    return 0
  fi
  [ "$PROJECT" = chatchat-staging ] || fail 1 "staging иска COMPOSE_PROJECT_NAME=chatchat-staging (дадено: ${PROJECT:-празно})."
  [ "$named" = "$PROJECT" ] || fail 1 "staging: .env трябва да носи COMPOSE_PROJECT_NAME=$PROJECT (там: ${named:-няма})."
  [ "$SHARED" != /opt/few-few/shared/chatchat ] || fail 1 "staging не ползва папката на продукцията ($SHARED)."
  export COMPOSE_PROJECT_NAME="$PROJECT"
}

pgdata_encrypted() { [ -f "$PGDATA_CONF" ] && grep -qx 'STATE=encrypted' "$PGDATA_CONF"; }

# Базата е в шифрования том: той трябва да е отключен и монтиран, а .env — да сочи compose към него.
# Иначе compose би вдигнал базата върху стария некриптиран том (db-data) — разминаване на данните.
check_pgdata() {
  if ! pgdata_encrypted; then
    if grep -q '^COMPOSE_FILE=.*docker-compose\.pgdata\.yml' "$APP_DIR/.env"; then
      fail 1 "COMPOSE_FILE в .env сочи шифрования том, а той не е настроен ($PGDATA_CONF) — DEPLOY.md, т. 12."
    fi
    return 0
  fi
  { mountpoint -q "$PGDATA_MOUNT" && [ -d "$PGDATA_MOUNT/data" ]; } ||
    fail 1 "шифрованият том на базата не е отключен/монтиран — sudo chatchat-pgdata open (DEPLOY.md, т. 12)."
  # COMPOSE_FILE е списък (и мониторингът, deploy/monitoring.sh) — важно е томът да е в него.
  grep -qE '^COMPOSE_FILE=(.*:)?docker-compose\.pgdata\.yml(:.*)?$' "$APP_DIR/.env" ||
    fail 1 "базата е в шифрования том, а в $SHARED/.env няма $COMPOSE_PGDATA — не я вдигам върху стария том."
}

# Прикачените файлове са извън release-а (иначе изчезват със следващия деплой) и само на едно място —
# $SHARED/attachments: оттам ги монтира compose (${CHATCHAT_SHARED}) и оттам ги чете дневният бекъп.
# uid 1000 = node в образа; 700 — само приложението (и root) влиза. Без -R: папката може да е голяма, а
# файловете вътре ги създава самото приложение.
ensure_attachments() {
  install -d -m 700 -o 1000 -g 1000 "$SHARED/attachments"
}

# Отчетите на оценъчния набор (evals/) за KPI таблото: root ги копира, приложението само чете (755 +
# :ro в compose). Без папката Docker би я създал сам — тук правата са явни.
ensure_eval_reports() {
  install -d -m 755 "$SHARED/eval-reports"
}

# Конфигът на clamd от репото → стабилния път, който compose монтира. Промяна → clamd се рестартира след
# `up` (чете конфига само при старт; файлът е монтиран, compose не вижда промяната сам).
CLAMD_CHANGED=0
sync_clamd_conf() {
  local src="$APP_DIR/deploy/clamav/clamd.conf" dst="$SHARED/clamd.conf"
  [ -f "$src" ] || fail 1 "няма $src в release-а — антивирусът няма конфиг."
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then return 0; fi
  [ ! -f "$dst" ] || CLAMD_CHANGED=1
  install -m 644 "$src" "$dst"
}

restart_clamav_if_changed() {
  [ "$CLAMD_CHANGED" = 1 ] || return 0
  if docker compose restart clamav >/dev/null; then
    ok "clamd е рестартиран с новия конфиг (сигнатурите се зареждат 1–2 минути)"
  else
    warn "clamd не се рестартира с новия конфиг — docker compose restart clamav"
  fi
}

# POSTGRES_PASSWORD влиза некодирана в DATABASE_URL (docker-compose.yml): „/“, „?“, „#“, „@“ и „%“ чупят
# адреса и приложението никога не стига до базата. По-добре отказ сега, отколкото сонда и откат.
check_db_password() {
  case "$(env_value POSTGRES_PASSWORD)" in
    '') fail 1 "POSTGRES_PASSWORD в .env е празна — openssl rand -hex 32 (DEPLOY.md, т. 1)." ;;
    *[/?#%@]*) fail 1 "POSTGRES_PASSWORD съдържа някой от знаците / ? # % @ — те чупят DATABASE_URL. Нова: openssl rand -hex 32." ;;
  esac
}

# Образите на базата и антивируса са заковани по digest. Теглят се само ако ги няма: изтеглен вече образ
# не зависи от Docker Hub (лимит на заявките, мрежа), а липсващ се тегли ПРЕДИ смяната, не по средата ѝ.
ensure_images() {
  local img
  for img in $(docker compose config --images); do
    case "$img" in *@sha256:*) ;; *) continue ;; esac
    docker image inspect "$img" >/dev/null 2>&1 && continue
    log "тегля $img…"
    docker pull -q "$img" >/dev/null || fail 1 "образът $img не се изтегли — работещите контейнери не са пипани."
  done
}

# Бекъп ПРЕДИ миграцията, щом томът с базата съществува (при пръв деплой няма какво). Тече след
# build-а, точно преди `up`. Без бекъп няма миграция: провалът тук спира деплоя, преди контейнерът на
# приложението да е сменен. Дъмпът е с --clean --if-exists: възстановява се в съществуващата база
# (DEPLOY.md, „Връщане назад“).
BACKUP_PLAN=""
plan_backup() {
  if docker volume inspect "${PROJECT}_db-data" >/dev/null 2>&1 || [ -f "$PGDATA_MOUNT/data/PG_VERSION" ]; then
    if [ "$SKIP_BACKUP" = "1" ]; then BACKUP_PLAN=skip; else BACKUP_PLAN=dump; fi
  else
    BACKUP_PLAN=first
  fi
}

backup_db() {
  case "$BACKUP_PLAN" in
    skip)
      log "CHATCHAT_SKIP_BACKUP=1 (откат) — без нов бекъп; последният дъмп отпреди миграцията остава"
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
  # В шифрования том, щом базата е там: некриптиран дъмп на некриптирания диск би обезсмислил тома.
  if pgdata_encrypted; then dir="$PGDATA_MOUNT/pre-deploy"; fi
  file="$dir/pre-deploy-$TS.sql.gz"
  install -d -m 700 "$dir"
  # базата може да е спряна (рестарт на машината, срив) — вдига се само тя, за да се дъмпне. Без
  # --no-recreate compose би пресъздал работещата база по дефиницията на НОВИЯ release още тук, преди
  # бекъпа; новата дефиниция влиза едва след него.
  docker compose up -d --no-recreate --wait db >/dev/null ||
    fail 1 "базата не тръгна за бекъпа — не мигрирам без бекъп."
  if docker compose exec -T db pg_dump --clean --if-exists -U chatchat -d chatchat | gzip >"$file.partial"; then
    mv -f "$file.partial" "$file"
    ok "бекъп преди миграция → $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    fail 1 "бекъпът преди миграция се провали — не мигрирам без бекъп."
  fi
  find "$dir" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' | sort -rn |
    tail -n "+$((KEEP_BACKUPS + 1))" | cut -d' ' -f2- | xargs -r rm -f
}

# Еднократно: томът, създаден от postgres:16-alpine (musl), минава на pgvector (Debian, glibc). Двете
# подреждат текста различно, затова индексите по текст са невалидни (проверено с amcheck: „high key
# invariant violated“) — REINDEX ги строи наново, ПРЕДИ приложението и миграцията да ги ползват.
# Собственика на данните (uid 70 → 999) го оправя entrypoint-ът на образа. Тече след бекъпа.
switch_db_image() {
  if [ "$BACKUP_PLAN" = first ]; then return 0; fi
  if [ -f "$PGVECTOR_MARK" ]; then return 0; fi
  log "базата минава на pgvector — еднократен REINDEX (DEPLOY.md, т. 11)…"
  docker compose up -d --no-deps --wait db >/dev/null ||
    fail 4 "базата не тръгна на новия образ. Виж: cd $APP_DIR && docker compose logs --tail=80 db"
  docker compose exec -T db psql -X -q -v ON_ERROR_STOP=1 -U chatchat -d chatchat -c 'REINDEX DATABASE chatchat' ||
    fail 4 "REINDEX след смяната на образа на базата се провали — нужен е човек (DEPLOY.md, т. 11)."
  mark_pgvector
  ok "базата е на pgvector, индексите са построени наново"
}

mark_pgvector() {
  [ -f "$PGVECTOR_MARK" ] && return 0
  install -d -m 700 "$(dirname "$PGVECTOR_MARK")"
  printf '%s\n' "$TS" >"$PGVECTOR_MARK"
}

# Код 200 сам не казва КОЙ отговаря на порта: /readyz на ChatChat връща {"ok":true,"app":"chatchat","ai":…} само когато
# базата отговаря — чака се точно това тяло.
wait_ready() {
  local url="http://127.0.0.1:$1/readyz" body deadline=$((SECONDS + HEALTH_WAIT))
  while :; do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null)" || body=""
    case "$body" in *'"ok":true'*)
      case "$body" in *'"ai":'*) return 0 ;; esac
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
# сочи насам. Тече след сондата: всяка грешка е предупреждение.
sync_nginx() {
  local port="$1" conf="$APP_DIR/deploy/nginx/$DOMAIN.conf" bak="$NGINX_SITE.bak-$TS" new renewal why=""
  if ! command -v nginx >/dev/null 2>&1; then
    warn "няма nginx на хоста — ChatChat отговаря само на 127.0.0.1:$port"
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
  # vhost-ът в репото сочи порта по подразбиране на средата си (продукцията 4330, staging 4331); друг
  # HTTP_PORT се вписва тук — иначе домейнът би сочил порт, на който не е ChatChat (чуждо приложение или 502)
  new="$(mktemp)" || return 1
  sed -E "s/127\.0\.0\.1:[0-9]+;/127.0.0.1:$port;/g" "$conf" >"$new"
  if ! grep -q "127.0.0.1:$port;" "$new"; then
    rm -f "$new"
    warn "vhost-ът в репото не сочи 127.0.0.1:<порт> — nginx не е пипан"
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

# Преходът към шифровани файлове (NFR-03): новите се пишат шифровани; старите нешифровани се шифроват
# тук, идемпотентно (нов обект → проверка → смяна). Отчетът е само броеве. Провал — предупреждение.
encrypt_files() {
  docker compose exec -T app node dist/cli/files.js encrypt && return 0
  warn "шифроването на старите прикачени файлове не завърши — повтори: cd $APP_DIR && docker compose exec -T app node dist/cli/files.js encrypt"
  return 1
}

# Еднократните стъпки, които скриптът не прави сам, и антивирусът, който още зарежда сигнатурите.
hints() {
  local tenants cid state
  tenants="$(docker compose exec -T db psql -X -U chatchat -d chatchat -tAc 'SELECT count(*) FROM "Tenant"' 2>/dev/null | tr -dc '0-9')" || tenants=""
  if [ "$tenants" = "0" ]; then
    warn "няма нито един клиент — създай първия администратор веднъж по DEPLOY.md (т. 4)"
  fi
  cid="$(docker compose ps -q clamav 2>/dev/null | head -n 1)" || cid=""
  state="$( [ -n "$cid" ] && docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" || state=""
  if [ "$state" != healthy ]; then
    warn "антивирусът още не е готов (${state:-няма контейнер}) — новите прикачени файлове чакат проверка. Виж: docker compose logs --tail=40 clamav"
  fi
  if [ "$STAGING" != 1 ] && ! pgdata_encrypted; then
    warn "данните на базата не са в шифрован том — веднъж: sudo bash $APP_DIR/deploy/pgdata-encrypt.sh enable (DEPLOY.md, т. 12)"
  fi
  monitoring_hint
}

# Мониторингът е по избор (deploy/monitoring.sh): изключен → само напомняне; включен → стекът вече е
# вдигнат от `up` (COMPOSE_FILE), тук се подравняват скриптът и таймерът за одитната верига от release-а.
monitoring_hint() {
  if ! grep -qE '^COMPOSE_FILE=(.*:)?docker-compose\.monitoring\.yml(:.*)?$' "$APP_DIR/.env"; then
    warn "мониторингът (аларми по имейл) не е включен — веднъж: sudo bash $APP_DIR/deploy/monitoring.sh (docs/runbook.md, „Включване“)"
    return 0
  fi
  [ -f "$APP_DIR/deploy/monitoring.sh" ] || return 0
  (source "$APP_DIR/deploy/monitoring.sh" && install_audit_timer >/dev/null) ||
    warn "таймерът за одитната верига не е обновен — sudo bash $APP_DIR/deploy/monitoring.sh"
}

main() {
  local port
  [ "$(id -u)" = "0" ] || fail 1 "пусни като root (sudo)."
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    fail 1 "липсва Docker с compose plugin."
  fi
  cd "$APP_DIR"
  sync_env
  check_project
  ensure_keys
  check_pgdata
  ensure_attachments
  ensure_eval_reports
  sync_clamd_conf
  check_db_password
  port="$(env_value HTTP_PORT | tr -dc '0-9')"
  port="${port:-4330}"
  log "build…"
  docker compose build app || fail 1 "build се провали — работещите контейнери не са пипани."
  ensure_images
  plan_backup
  backup_db
  switch_db_image
  log "up (entrypoint-ът прилага миграциите)…"
  docker compose up -d --remove-orphans || fail 4 "docker compose up се провали."
  wait_ready "$port" ||
    fail 4 "на 127.0.0.1:$port/readyz не отговаря ChatChat след ${HEALTH_WAIT} s. Виж: cd $APP_DIR && docker compose logs --tail=80 app"
  ok "жив на 127.0.0.1:$port"
  # Новият код вече работи: оттук нататък нищо не сменя изхода 0 (за autodeploy 1 значи „спрян преди
  # смяната“, а това вече не е вярно).
  mark_pgvector || warn "не записах $PGVECTOR_MARK — следващият деплой ще пусне REINDEX пак (безвредно)"
  remember_live || warn "не записах $LAST_GOOD — откатът и DEPLOY.md сочат предишния release"
  restart_clamav_if_changed || true
  encrypt_files || true
  if [ "$STAGING" = 1 ]; then
    log "staging: без дневния бекъп и ретенцията (таймерите са на продукцията) — данните са тестови"
  else
    (source "$APP_DIR/deploy/timers-install.sh" && install_timers) || warn "дневният шифрован бекъп/ретенцията не са готови — DEPLOY.md, т. 9"
  fi
  sync_nginx "$port" || warn "nginx не е обновен — ChatChat е жив на 127.0.0.1:$port"
  hints || true
}

# Изпълнен — разгръща; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
