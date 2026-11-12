#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/deploy.sh — разгръща Rilievi Impianti от тази папка на release-а (Docker Compose).
#
#   sudo bash /opt/few-few/current/rilievi/deploy/deploy.sh    # ръчно (DEPLOY.md)
#   deploy/autodeploy.sh го вика за всеки release с rilievi/   # автоматично — същият път
#
# Ред: общото заключване с дневния бекъп → тайните от стабилния път → build (приложението и фоновият
# процес на снимките) → бекъп на базата преди миграция (след build-а: дъмпът е отпреди самата смяна) →
# страницата за поддръжка на nginx → up (entrypoint-ът прилага `prisma migrate deploy`) → чака, докато на
# порта отговори именно Rilievi → чистене на старите образи → фоновият процес върви → дневният бекъп →
# vhost-ът от репото, щом има сертификат → IndexNow при променен sitemap → подсказки.
#
# Тайни не се измислят — освен ключа на печата (ensure_seal_key): нов, без предишно състояние, създава се
# веднъж и после само се чете. Изход: 0 — жив; 3 — няма .env (машината не е настроена); 4 — контейнерите са
# сменени, но Rilievi не отговаря (autodeploy връща предишния код); 1 — спрян преди смяната
# (работещите не са пипани). След успешната сонда нищо не сменя изхода 0.
#
# RILIEVI_SKIP_BACKUP=1 — без нов дъмп (откатът на autodeploy): иначе всеки провал гори слот от
# ротацията и изтласква дъмпа отпреди счупената миграция.
# RILIEVI_LOCK / RILIEVI_LOCK_WAIT — общото заключване с backup.sh и колко секунди се чака за него.
# RILIEVI_INDEXNOW=0 — без IndexNow след деплоя.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}"
DOMAIN="${RILIEVI_DOMAIN:-rilievi.carbonstealth.eu}"
NGINX_SITE="${RILIEVI_NGINX_SITE:-/etc/nginx/sites-available/rilievi}"
NGINX_LINK="${RILIEVI_NGINX_LINK:-/etc/nginx/sites-enabled/rilievi}"
LE_DIR="${RILIEVI_LE_DIR:-/etc/letsencrypt}"
HEALTH_WAIT="${RILIEVI_HEALTH_WAIT:-90}"
MIGRATION_WAIT="${RILIEVI_MIGRATION_WAIT:-1800}"
KEEP_BACKUPS="${RILIEVI_KEEP_BACKUPS:-5}"
SKIP_BACKUP="${RILIEVI_SKIP_BACKUP:-0}"
LAST_GOOD="${RILIEVI_LAST_GOOD:-$SHARED/last-good}"
LOCK="${RILIEVI_LOCK:-/run/lock/rilievi-deploy.lock}"
LOCK_WAIT="${RILIEVI_LOCK_WAIT:-1800}"
INDEXNOW="${RILIEVI_INDEXNOW:-1}"
MAINT_DIR="${RILIEVI_MAINT_DIR:-/var/www/rilievi}"
TS="$(date +%Y%m%d-%H%M%S)"

log()  { printf '\033[1;36m▸ rilievi: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ rilievi: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ rilievi: %s\033[0m\n' "$*" >&2; }
fail() {
  local code="$1"
  shift
  printf '\033[31m✘ rilievi: %s\033[0m\n' "$*" >&2
  exit "$code"
}

# Деплоят и дневният бекъп (backup.sh, 03:10 UTC) не вървят едновременно: pg_dump държи заключвания, на
# които ALTER TABLE на миграцията чака, а дъмп посред миграция е от половин схема. Същият файл и в
# backup.sh. Заключването е на дескриптор 9 и пада само при изхода на процеса.
take_lock() {
  command -v flock >/dev/null 2>&1 || fail 1 "липсва flock (util-linux) — без него деплоят може да тръгне посред бекъпа."
  install -d -m 755 "$(dirname "$LOCK")" || fail 1 "няма папка за заключването $LOCK."
  exec 9>>"$LOCK" || fail 1 "не мога да отворя $LOCK."
  if ! flock -n 9; then
    log "дневният бекъп (или друг деплой) върви — чакам до ${LOCK_WAIT} s…"
    flock -w "$LOCK_WAIT" 9 ||
      fail 1 "заключването $LOCK не се освободи за ${LOCK_WAIT} s — работещото не е пипано. Виж: systemctl status rilievi-backup.service"
  fi
}

# Стойност от .env, без файлът да се изпълнява (`source` би пуснал всеки ред като код). Не се печата.
env_value() {
  local v
  v="$(sed -n "s/^$1=//p" "$APP_DIR/.env" | tail -n 1 | tr -d '\r')" || v=""
  v="${v%\"}" && v="${v#\"}" && v="${v%\'}" && v="${v#\'}"
  printf '%s' "$v"
}

# Тайните живеят в $SHARED/.env (mode 600) и оттам влизат във всеки release — редактира се там.
sync_env() {
  if [ -f "$SHARED/.env" ]; then
    install -d -m 700 "$SHARED"
    install -m 600 "$SHARED/.env" "$APP_DIR/.env"
  elif [ -f "$APP_DIR/.env" ]; then
    install -d -m 700 "$SHARED"
    install -m 600 "$APP_DIR/.env" "$SHARED/.env"
    ok "запазих .env в $SHARED/.env — оттук нататък се редактира там"
  else
    fail 3 "няма $SHARED/.env — тайни не се измислят. Направи го веднъж: sudo bash $APP_DIR/deploy/setup-env.sh"
  fi
}

# Compose чете целия файл и спира на `${INTERVENTI_SEAL_KEY:?…}` на услугата app, преди да стигне до
# базата — а тук ключът липсва точно защото се проверява дали да се създаде (деплоят на 30 октомври 2026
# спря на това). За командите само към базата интерполацията получава заместител: db не го ползва
# (дефиницията ѝ не се сменя, базата не се пресъздава), а app не се пуска оттук.
db_compose() { INTERVENTI_SEAL_KEY=chiave-mancante docker compose "$@"; }

# Всичко в базата, което е вързано за INTERVENTI_SEAL_KEY (src/auth/chiavi.ts извежда от него и други
# ключове): печатите на листовете, протоколите и регистрите на доказателствата, тайните на 2FA и
# резервните кодове, шифрованата поща и ключовете на Revolut, API ключовете. Имената — от
# prisma/schema.prisma. Таблица или колона, която още я няма (машина отпреди миграцията ѝ), не се брои и
# не чупи заявката: CASE пуска преброяването само за съществуваща колона. Един ред за всеки обект:
# `Таблица.колона|брой` (празен брой — няма го в тази база).
KEY_BOUND_SQL="$(cat <<'SQL'
SELECT t.tab || '.' || t.col || '|' || coalesce(
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = t.tab AND c.column_name = t.col
  ) THEN (xpath('/row/n/text()', query_to_xml(
    format('SELECT count(*) AS n FROM public.%I WHERE %I IS NOT NULL', t.tab, t.col),
    false, true, '')))[1]::text END, '')
FROM (VALUES
  ('Intervento', 'sigillo'),
  ('Verbale', 'sigillo'),
  ('BuonoFirma', 'sigillo'),
  ('Accettazione', 'sigillo'),
  ('AccettazioneOfferta', 'sigillo'),
  ('EmissioneCalcolo', 'sigillo'),
  ('User', 'totpSecretEnc'),
  ('RecoveryCode', 'codeHash'),
  ('ConfigPagamenti', 'chiaveEnc'),
  ('ConfigPagamenti', 'webhookSegretoEnc'),
  ('PostaPortale', 'passwordEnc'),
  ('ChiaveApi', 'hash')
) AS t(tab, col)
SQL
)"

# Редовете `Таблица.колона|брой` от базата: нищо — и при база без том (пръв деплой). Грешка — няма
# отговор: тогава ключ не се създава.
key_bound_rows() {
  docker volume inspect rilievi_db-data >/dev/null 2>&1 || return 0
  # --no-recreate: работещата база не се пресъздава по дефиницията на новия release (както при бекъпа).
  db_compose up -d --no-recreate --wait db >/dev/null || return 1
  db_compose exec -T db psql -U rilievi -d rilievi -v ON_ERROR_STOP=1 -tAc "$KEY_BOUND_SQL"
}

# Ключът на печата (src/auth/chiavi.ts): липсва ли в $SHARED/.env, се създава веднъж там — САМО ако в
# базата няма нищо, вързано за него (машина отпреди листовете или празна). Има ли, ключът е загубен, не
# нов: нов ключ би обезсилил печатите, 2FA, шифрованите ключове за пощата и Revolut и API ключовете —
# затова деплоят спира и казва да се върне старият от бекъпа на тайните (DEPLOY.md, т. 1 и „Нов сървър“).
ensure_seal_key() {
  [ -z "$(env_value INTERVENTI_SEAL_KEY)" ] || return 0
  command -v openssl >/dev/null 2>&1 || fail 1 "липсва openssl — не мога да създам INTERVENTI_SEAL_KEY."
  local rows what n total=0 seen=0 found=""
  rows="$(key_bound_rows)" ||
    fail 1 "не мога да проверя в базата какво е вързано за ключа — не създавам INTERVENTI_SEAL_KEY наслуки."
  if docker volume inspect rilievi_db-data >/dev/null 2>&1; then
    while IFS='|' read -r what n; do
      [ -n "$what" ] || continue
      seen=$((seen + 1))
      [ -n "$n" ] || continue
      case "$n" in *[!0-9]*) fail 1 "базата върна „$n“ за $what — не създавам INTERVENTI_SEAL_KEY наслуки." ;; esac
      total=$((total + n))
      [ "$n" = "0" ] || found="$found $what=$n"
    done <<<"$rows"
    [ "$seen" -gt 0 ] ||
      fail 1 "базата не каза какво е вързано за ключа — не създавам INTERVENTI_SEAL_KEY наслуки."
  fi
  [ "$total" = "0" ] ||
    fail 1 "INTERVENTI_SEAL_KEY липсва в $SHARED/.env, а в базата има $total записа, вързани за ключа (${found# }): ключът е загубен, не нов. Върни го от бекъпа на тайните (DEPLOY.md, т. 1) — нов ключ би ги обезсилил."
  # Без нов ред накрая новият ключ би се залепил за последния ред на файла.
  [ -z "$(tail -c 1 "$SHARED/.env")" ] || printf '\n' >>"$SHARED/.env"
  printf 'INTERVENTI_SEAL_KEY=%s\n' "$(openssl rand -hex 32)" >>"$SHARED/.env"
  install -m 600 "$SHARED/.env" "$APP_DIR/.env"
  ok "създадох INTERVENTI_SEAL_KEY в $SHARED/.env — пази го в бекъпа на тайните, никога не го сменяй"
}

# POSTGRES_PASSWORD влиза некодирана в DATABASE_URL: „/“, „?“, „#“, „%“ и „@“ чупят адреса и
# приложението никога не стига до базата. По-добре отказ сега, отколкото сонда и откат.
check_secrets() {
  case "$(env_value POSTGRES_PASSWORD)" in
    '') fail 1 "POSTGRES_PASSWORD е празна — DEPLOY.md, т. 1." ;;
    *[/?#%@]*) fail 1 "POSTGRES_PASSWORD съдържа / ? # % или @ — те чупят DATABASE_URL. Нова: openssl rand -hex 32." ;;
  esac
  printf '%s' "$(env_value JWT_SECRET)" | grep -Eqx '[0-9a-fA-F]{64}' ||
    fail 1 "JWT_SECRET трябва да е 64 hex знака (openssl rand -hex 32) — DEPLOY.md, т. 1."
  printf '%s' "$(env_value INTERVENTI_SEAL_KEY)" | grep -Eqx '[0-9a-fA-F]{64}' ||
    fail 1 "INTERVENTI_SEAL_KEY трябва да е 64 hex знака — DEPLOY.md, т. 1 (не се сменя, ако вече има потвърдени листове)."
}

# Има ли база за бекъп — решава се преди build-а: при пръв деплой томът още не съществува.
BACKUP_PLAN=""
plan_backup() {
  if [ "$SKIP_BACKUP" = "1" ]; then
    BACKUP_PLAN=skip
  elif docker volume inspect rilievi_db-data >/dev/null 2>&1; then
    BACKUP_PLAN=dump
  else
    BACKUP_PLAN=first
  fi
}

# Бекъп ПРЕДИ миграцията. Без бекъп няма миграция: провалът тук спира деплоя, преди контейнерът на
# приложението да е сменен. Дъмпът е с --clean --if-exists: възстановява се в съществуващата база.
backup_db() {
  case "$BACKUP_PLAN" in
    skip) log "RILIEVI_SKIP_BACKUP=1 (откат) — без нов бекъп"; return 0 ;;
    first) log "няма том с база (пръв деплой) — няма какво да се бекъпва"; return 0 ;;
    dump) ;;
    *) fail 1 "бекъпът няма план — не мигрирам без бекъп." ;;
  esac
  local dir="$SHARED/backups" file
  file="$dir/pre-deploy-$TS.sql.gz"
  install -d -m 700 "$dir"
  # --no-recreate: работещата база не се пресъздава по дефиницията на НОВИЯ release преди бекъпа.
  docker compose up -d --no-recreate --wait db >/dev/null ||
    fail 1 "базата не тръгна за бекъпа — не мигрирам без бекъп."
  if docker compose exec -T db pg_dump --clean --if-exists -U rilievi -d rilievi | gzip >"$file.partial"; then
    mv -f "$file.partial" "$file"
    ok "бекъп преди миграция → $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    fail 1 "бекъпът преди миграция се провали — не мигрирам без бекъп."
  fi
  find "$dir" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' | sort -rn |
    tail -n "+$((KEEP_BACKUPS + 1))" | cut -d' ' -f2- | xargs -r rm -f
}

# Миграция, която още тече (entrypoint-ът на app я прилага): ред в _prisma_migrations без край, без
# отказ и без грешка. Провалената има `logs` — по нея не се чака.
migration_running() {
  local n
  n="$(docker compose exec -T db psql -U rilievi -d rilievi -tAc \
    'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NULL' \
    2>/dev/null | tr -dc '0-9')" || n=""
  [ -n "$n" ] && [ "$n" -gt 0 ]
}

# Код 200 сам не казва КОЙ отговаря на порта: чака се маркерът на Rilievi и база, която отговаря.
# Докато миграция още тече, се чака и след HEALTH_WAIT (до MIGRATION_WAIT): провал посред миграция
# би пуснал отката върху полуприложена схема (одит, 4 ноември 2026).
wait_healthy() {
  local url="http://127.0.0.1:$1/health" body deadline=$((SECONDS + HEALTH_WAIT))
  local hard=$((SECONDS + MIGRATION_WAIT))
  while :; do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null)" || body=""
    case "$body" in *'"app":"rilievi"'*)
      case "$body" in *'"status":"ok"'*) return 0 ;; esac
      ;;
    esac
    if [ "$SECONDS" -ge "$deadline" ]; then
      [ "$SECONDS" -lt "$hard" ] && migration_running || return 1
      log "миграцията още тече — чакам…"
      deadline=$((SECONDS + 30))
    fi
    sleep 3
  done
}

# Фоновият процес на снимките (worker) тръгва след приложението. Без него порталът работи, само
# каченото стои в опашката — затова предупреждение, не провал на деплоя.
check_worker() {
  local deadline=$((SECONDS + 30))
  while :; do
    docker compose ps --status running --services 2>/dev/null | grep -qx worker && return 0
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep 3
  done
}

# Последният release, който е отговорил — целта на отката. Истинският път, без symlink-а current.
remember_live() {
  local real
  real="$(cd "$APP_DIR" && pwd -P)" && install -d -m 700 "$(dirname "$LAST_GOOD")" &&
    printf '%s\n' "$real" >"$LAST_GOOD.tmp" && mv -f "$LAST_GOOD.tmp" "$LAST_GOOD"
}

# Всеки build тагва образите отново като rilievi-app / rilievi-worker: предишните остават висящи (<none>)
# и се трупат на диска, на който са и базата, снимките и дъмповете (под MEDIA_MIN_FREE_MB качването спира).
# След успешната сонда: висящите образи само на този compose проект и build кешът, по-стар от 7 дни
# (по-новият остава — от него откатът се билдва бързо). Кешът на builder-а е общ за машината.
prune_images() {
  docker image prune -f --filter label=com.docker.compose.project=rilievi >/dev/null &&
    docker builder prune -f --filter until=168h >/dev/null
}

# Страницата, която nginx показва, докато приложението не отговаря (error_page във vhost-а): слага се
# преди `up`, за да я има още при рестарта на този деплой. Чете я nginx (www-data) — затова 755/644
# въпреки umask 077 на скрипта; в нея няма нищо тайно.
install_maint() {
  local page="$APP_DIR/deploy/nginx/manutenzione.html"
  [ -f "$page" ] || return 1
  (umask 022 && install -d -m 755 "$MAINT_DIR" && install -m 644 "$page" "$MAINT_DIR/manutenzione.html")
}

# Дневният бекъп: таймер на systemd (03:10 UTC) пуска deploy/backup.sh от последния работещ release.
install_backup_timer() {
  command -v systemctl >/dev/null 2>&1 || { warn "няма systemd — дневният бекъп не е сложен"; return 0; }
  install -m 644 "$APP_DIR/deploy/systemd/rilievi-backup.service" /etc/systemd/system/rilievi-backup.service &&
    install -m 644 "$APP_DIR/deploy/systemd/rilievi-backup-alert.service" /etc/systemd/system/rilievi-backup-alert.service &&
    install -m 644 "$APP_DIR/deploy/systemd/rilievi-backup.timer" /etc/systemd/system/rilievi-backup.timer &&
    systemctl daemon-reload &&
    systemctl enable --now rilievi-backup.timer >/dev/null 2>&1 &&
    ok "дневният бекъп е включен (rilievi-backup.timer, 14 дни: базата и снимките, проверено възстановяване)"
}

# Vhost-ът е файл в репото: щом има сертификат, сървърът носи точно него, с порта от HTTP_PORT
# (nginx -t, после reload; при грешка се връща старият). Сертификатът се взема веднъж на ръка.
sync_nginx() {
  local port="$1" conf="$APP_DIR/deploy/nginx/$DOMAIN.conf" bak="$NGINX_SITE.bak-$TS" new why=""
  if ! command -v nginx >/dev/null 2>&1; then
    warn "няма nginx на хоста — Rilievi отговаря само на 127.0.0.1:$port"
    return 0
  fi
  if [ ! -f "$LE_DIR/live/$DOMAIN/fullchain.pem" ]; then
    warn "няма TLS сертификат за $DOMAIN — порталът още не е публичен. Веднъж, когато DNS сочи насам:"
    warn "  certbot certonly --nginx -d $DOMAIN --deploy-hook 'systemctl reload nginx' && bash $APP_DIR/deploy/deploy.sh"
    return 0
  fi
  [ -f "$conf" ] || { warn "няма $conf в release-а — nginx не е пипан"; return 0; }
  new="$(mktemp)" || return 1
  sed "s/127\.0\.0\.1:4330;/127.0.0.1:$port;/g" "$conf" >"$new"
  if ! grep -q "127.0.0.1:$port;" "$new"; then
    rm -f "$new"
    warn "vhost-ът в репото не сочи 127.0.0.1:4330 — nginx не е пипан"
    return 1
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

# IndexNow (Bing, Yandex, Seznam, Naver, Yep — Google не участва): само когато sitemap-ът се е променил,
# не на всеки деплой. Никога провал: докато сайтът не е публичен с TLS, ключът не се проверява и
# следващият деплой опитва пак. С node и tools/seo/indexnow.mjs от същия архив — него; иначе същата
# заявка с curl (ключът — public/indexnow-key.txt, адресите — от локалния sitemap).
ping_indexnow() {
  local port="$1" tool="$APP_DIR/../tools/seo/indexnow.mjs" stamp="$SHARED/indexnow-sitemap.sha256"
  local xml sum site host key urls payload
  [ "$INDEXNOW" = "1" ] || return 0
  if ! xml="$(curl -fsS --max-time 10 "http://127.0.0.1:$port/sitemap.xml")"; then
    warn "IndexNow: sitemap.xml не се чете локално — пропускам"
    return 0
  fi
  sum="$(printf '%s' "$xml" | sha256sum | cut -d' ' -f1)"
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$sum" ]; then
    log "IndexNow: sitemap-ът не е променян — няма какво да се подава"
    return 0
  fi
  site="$(env_value PUBLIC_BASE_URL)"
  site="${site%/}"
  case "$site" in
    https://*) ;;
    *) warn "IndexNow: PUBLIC_BASE_URL не е https — сайтът още не е публичен, пропускам"; return 0 ;;
  esac
  if [ -f "$tool" ] && command -v node >/dev/null 2>&1; then
    if node "$tool" "$site" >/dev/null; then
      printf '%s\n' "$sum" >"$stamp"
      ok "IndexNow: подаден е sitemap-ът на $site"
    else
      warn "IndexNow: подаването не мина (сайтът публичен ли е, с TLS?) — следващият деплой опитва пак"
    fi
    return 0
  fi
  key="$(tr -dc '0-9A-Za-z-' <"$APP_DIR/public/indexnow-key.txt" 2>/dev/null)" || key=""
  [ -n "$key" ] || { warn "IndexNow: няма $APP_DIR/public/indexnow-key.txt — пропускам"; return 0; }
  host="${site#https://}"
  host="${host%%/*}"
  # Само адреси на този сайт и без знаци, които биха счупили JSON-а.
  urls="$(printf '%s' "$xml" | grep -o '<loc>[^<]*</loc>' | sed 's#</\{0,1\}loc>##g' |
    grep -E "^https://${host//./\\.}(/[A-Za-z0-9._~/?=&%:+,;@!*()'-]*)?\$" |
    sed 's/.*/"&"/' | paste -sd, -)" || urls=""
  [ -n "$urls" ] || { warn "IndexNow: в sitemap-а няма адреси на $host — пропускам"; return 0; }
  payload="$(printf '{"host":"%s","key":"%s","keyLocation":"%s/indexnow-key.txt","urlList":[%s]}' \
    "$host" "$key" "$site" "$urls")"
  if curl -fsS --max-time 20 -o /dev/null -A "$host IndexNow client" \
    -H 'content-type: application/json; charset=utf-8' --data-binary "$payload" \
    https://api.indexnow.org/indexnow; then
    printf '%s\n' "$sum" >"$stamp"
    ok "IndexNow: подаден е sitemap-ът на $site (curl — без node на хоста)"
  else
    warn "IndexNow: подаването не мина (сайтът публичен ли е, с TLS?) — следващият деплой опитва пак"
  fi
}

# Първият MASTER не се създава сам (паролата не минава през скрипт): казваме командата.
# Без копие извън сървъра и без аларма никой не разбира, че бекъпът е спрял или че дискът е загубен
# (одитът от 12 ноември 2026): деплоят го казва всеки път, докато не се настрои. Чете само ИМЕНАТА на
# променливите в backup.env, никога стойностите им (адресите носят ключове).
backup_gaps() {
  local env_file="$SHARED/backup.env" name missing=""
  for name in RILIEVI_OFFSITE RILIEVI_ALERT_URL RILIEVI_HEARTBEAT_URL; do
    if ! { [ -f "$env_file" ] && grep -Eq "^[[:space:]]*(export[[:space:]]+)?${name}=[^[:space:]]" "$env_file"; }; then
      missing="$missing $name"
    fi
  done
  [ -z "$missing" ] ||
    warn "в $env_file липсват:${missing} — без тях няма копие извън сървъра и/или никой не научава за провален бекъп (DEPLOY.md, т. 6)"
}

hints() {
  backup_gaps || true
  local users
  users="$(docker compose exec -T db psql -U rilievi -d rilievi -tAc 'SELECT count(*) FROM "User"' 2>/dev/null | tr -dc '0-9')" || users=""
  if [ "$users" = "0" ]; then
    warn "няма нито един акаунт — създай MASTER веднъж (DEPLOY.md, т. 4):"
    warn "  sudo bash $APP_DIR/deploy/create-master.sh"
  fi
}

main() {
  local port
  [ "$(id -u)" = "0" ] || fail 1 "пусни като root (sudo)."
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    fail 1 "липсва Docker с compose plugin."
  fi
  cd "$APP_DIR"
  take_lock
  sync_env
  ensure_seal_key
  check_secrets
  port="$(env_value HTTP_PORT | tr -dc '0-9')"
  port="${port:-4330}"
  plan_backup
  log "build…"
  docker compose build app worker || fail 1 "build се провали — работещите контейнери не са пипани."
  backup_db
  install_maint || warn "страницата за поддръжка не е в $MAINT_DIR — докато приложението тръгва, nginx връща 404 вместо нея"
  log "up (entrypoint-ът прилага миграциите)…"
  # Първо базата и приложението: worker-ът чака здраво приложение (depends_on), а `up` на всичко наведнъж
  # пада, ако дълга миграция надживее healthcheck-а — тогава откатът би тръгнал посред миграцията.
  # Старият worker спира (връща файла си в опашката), за да не чете схема, която миграцията сменя.
  docker compose stop worker >/dev/null 2>&1 || true
  docker compose up -d --remove-orphans db app || fail 4 "docker compose up се провали."
  wait_healthy "$port" ||
    fail 4 "на 127.0.0.1:$port не отговаря Rilievi след ${HEALTH_WAIT} s. Виж: cd $APP_DIR && docker compose logs --tail=80 app"
  ok "жив на 127.0.0.1:$port"
  # Новият код вече работи: оттук нататък нищо не сменя изхода 0.
  remember_live || warn "не записах $LAST_GOOD — откатът сочи предишния release"
  prune_images || warn "старите образи на rilievi не са изчистени — docker image ls --filter dangling=true"
  docker compose up -d worker >/dev/null 2>&1 || true
  check_worker || warn "фоновият процес на снимките не върви — каченото чака в опашката. Виж: cd $APP_DIR && docker compose logs --tail=80 worker"
  install_backup_timer || warn "дневният бекъп не е сложен — DEPLOY.md, т. 6"
  sync_nginx "$port" || warn "nginx не е обновен — Rilievi е жив на 127.0.0.1:$port"
  ping_indexnow "$port" || warn "IndexNow не мина — следващият деплой опитва пак"
  hints || true
}

# Изпълнен — разгръща; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
