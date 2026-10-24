#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  АСО — autodeploy за VPS (build-from-source, без registry).
#
#  Употреба: качваш новия архив в /root, разархивираш го и пускаш този скрипт
#  от портала (там, където са apps/ и infra/):
#
#     cd ~/Few-few-main/Gaming        # или където се е разархивирал порталът
#     bash infra/autodeploy.sh
#
#  Какво прави (идемпотентно — може да се пуска колкото пъти искаш):
#   1. Синхронизира пресния сорс към стабилна папка $DEPLOY_DIR (по подр. /root/aso),
#      като ПАЗИ .env и Docker обемите → базата и тайните оцеляват между качванията.
#   2. Гарантира .env: при жива legacy база ОСИНОВЯВА стария .env (или абортира с
#      инструкция — нови тайни биха заключили базата); генерира тайни само на чисто.
#   3. БИЛДВА ПРЕДИ да сваля стария стек — провален билд оставя продукцията жива;
#      образите на работещата версия се пазят с таг :rollback.
#   4. БЕКЪП на базата (pg_dump, custom формат) ПРЕДИ свалянето — api мигрира
#      схемата при старт, затова копие има преди всяка миграция. Провален бекъп
#      спира деплоя (SKIP_BACKUP=1 само съзнателно). Пазят се последните $BACKUP_KEEP.
#   5. Сваля стария стек (вкл. legacy `infra` проект) и МИГРИРА обемите му еднократно
#      (копие; оригиналът остава като бекъп) → живата база се пренася, не се губи.
#   6. Вдига новия стек и проверява здравето на 4-те услуги (api/web/marketing/realtime).
#      Нездрав → ВРЪЩА предишните образи, вдига ги и излиза с код 1 (бекъпът е до него).
#   7. При ПЪРВО пускане предлага nginx конфиг (портовете от .env) + сочи към certbot
#      (после НЕ пипа nginx, само предупреждава при разминаване на портовете).
#
#  Всичко минава само на localhost; публичният вход е host nginx на 443.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── настройки (могат да се подменят през околната среда) ─────────────────────
DEPLOY_DIR="${DEPLOY_DIR:-/root/aso}"
PROJECT="${COMPOSE_PROJECT:-aso}"
DOMAIN="${DOMAIN:-gaming.carbonstealth.eu}"
OWNER_EMAIL="${BOOTSTRAP_OWNER_EMAIL:-admin@carbonstealth.eu}"
COMPOSE_FILE="infra/docker-compose.yml"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
SERVICES="api realtime worker web marketing"   # билдваните от нас (за rollback)

# ── малко цвят за четимост ───────────────────────────────────────────────────
c() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
step() { c "1;36" "▶ $*"; }
ok() { c "1;32" "  ✓ $*"; }
warn() { c "1;33" "  ! $*"; }
die() { c "1;31" "✗ $*"; exit 1; }

# ── 0) намери сорса (папката, в която живее този скрипт е infra/) ────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$SRC_DIR/$COMPOSE_FILE" ] || die "Не намирам $COMPOSE_FILE до скрипта. Пусни го от портала (папката с apps/ и infra/)."

command -v docker >/dev/null || die "Docker липсва. Инсталирай Docker Engine + compose plugin: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Липсва 'docker compose' (v2)."

# ── 1) синхронизирай сорса към стабилната deploy папка (пази .env) ───────────
step "Синхронизирам сорса → $DEPLOY_DIR (пазя .env и обемите)"
mkdir -p "$DEPLOY_DIR"
if [ "$(realpath "$SRC_DIR")" != "$(realpath "$DEPLOY_DIR")" ]; then
  if command -v rsync >/dev/null; then
    rsync -a --delete \
      --exclude '.env' --exclude '.env.*' --exclude '.git' --exclude 'node_modules' \
      --exclude 'dist' --exclude '.next' --exclude '.turbo' \
      "$SRC_DIR"/ "$DEPLOY_DIR"/
  else
    # fallback без rsync: изтрий всичко освен .env, после копирай
    find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 ! -name '.env' ! -name '.env.*' -exec rm -rf {} +
    cp -a "$SRC_DIR"/. "$DEPLOY_DIR"/
  fi
  ok "сорсът е обновен"
else
  ok "вече работим в $DEPLOY_DIR — без копиране"
fi
cd "$DEPLOY_DIR"

# ── 2) гарантирай .env (истински тайни при първо пускане; после ги пази) ─────
# Жива legacy база без .env тук? НИКОГА не генерирай тайни на сляпо — pg обемът
# пази СТАРАТА парола и нови тайни биха заключили базата (и "изгубили" акаунтите).
# Възстановява .env от СТАРИТЕ контейнери на проекта „infra“ (пуснати или
# спрени): паролата на базата живее в средата на postgres контейнера, а JWT/
# вътрешните тайни — в средата на api контейнера. Нищо не се печата; файлът е
# 600. Липсващите JWT/вътрешни тайни се генерират наново (това само изписва
# влезлите потребители — акаунтите и базата остават). Връща 1, ако няма стар
# postgres контейнер (тогава паролата е неизвестна и не гадаем).
harvest_legacy_env() {
  local pg="" api="" out="$1" proj
  # първо „infra“ (легаси), после самия $PROJECT (изгубен .env в $DEPLOY_DIR)
  for proj in infra "$PROJECT"; do
    pg="$(docker ps -aq --filter label=com.docker.compose.project="$proj" --filter label=com.docker.compose.service=postgres | head -1)"
    [ -n "$pg" ] || continue
    api="$(docker ps -aq --filter label=com.docker.compose.project="$proj" --filter label=com.docker.compose.service=api | head -1)"
    break
  done
  [ -n "$pg" ] || return 1
  local old_umask; old_umask="$(umask)"
  umask 077
  {
    echo "# АСО .env — възстановен от старите контейнери от autodeploy.sh $(date -u +%F)"
    docker inspect "$pg" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^POSTGRES_(USER|PASSWORD|DB)=' || true
    if [ -n "$api" ]; then
      docker inspect "$api" --format '{{range .Config.Env}}{{println .}}{{end}}' |
        grep -E '^(JWT_SECRET|JWT_REFRESH_SECRET|INTERNAL_API_SECRET|CORS_ORIGINS|PUBLIC_WEB_URL|PUBLIC_API_URL|WEB_BASE_PATH|COOKIE_DOMAIN|BOOTSTRAP_OWNER_EMAIL|STRIPE_[A-Z_]+|SMTP_[A-Z_]+|GOOGLE_CLIENT_[A-Z]+|FACEBOOK_APP_[A-Z]+|DISCORD_WEBHOOK_URL|SENTRY_DSN)=' || true
    fi
  } > "$out"
  umask "$old_umask"
  grep -q '^POSTGRES_PASSWORD=' "$out" || { rm -f "$out"; return 1; }
  # попълни липсващото (никога не пипа наличните стойности)
  for kv in "POSTGRES_USER=aso" "POSTGRES_DB=aso" \
            "JWT_SECRET=$(openssl rand -hex 32)" "JWT_REFRESH_SECRET=$(openssl rand -hex 32)" \
            "INTERNAL_API_SECRET=$(openssl rand -hex 24)" \
            "CORS_ORIGINS=https://${DOMAIN}" "PUBLIC_WEB_URL=https://${DOMAIN}" "WEB_BASE_PATH=/app" \
            "PUBLIC_API_URL=https://${DOMAIN}" "BOOTSTRAP_OWNER_EMAIL=${OWNER_EMAIL}" \
            "STRIPE_TOS_CONFIGURED=false"; do
    grep -q "^${kv%%=*}=" "$out" || echo "$kv" >> "$out"
  done
  chmod 600 "$out"
  return 0
}

LIVE_VOL=""
for v in infra_aso_pgdata "${PROJECT}_aso_pgdata"; do
  docker volume inspect "$v" >/dev/null 2>&1 && { LIVE_VOL="$v"; break; }
done
if [ ! -f .env ] && [ -n "$LIVE_VOL" ]; then
  step "Жива база ($LIVE_VOL) без .env — търся старите тайни"
  for cand in "${LEGACY_ENV:-}" "$SRC_DIR/.env" /root/Few-few-main/Gaming/.env; do
    if [ -n "$cand" ] && [ -f "$cand" ] && grep -q '^POSTGRES_PASSWORD=' "$cand"; then
      cp "$cand" .env && chmod 600 .env
      ok "приех стария .env от $cand (пази паролата, с която е инициализирана базата)"
      break
    fi
  done
  if [ ! -f .env ] && harvest_legacy_env .env; then
    ok "възстанових .env от старите контейнери (паролата на базата е запазена; липсващите тайни са генерирани)"
  fi
  [ -f .env ] || die "Жива база без .env и без стари контейнери, от които да се възстанови! Копирай стария: cp <стар-архив>/Gaming/.env $DEPLOY_DIR/.env (или LEGACY_ENV=/path/to/.env bash infra/autodeploy.sh). Нови тайни = изоставена база и изчезнали акаунти."
fi
if [ -f .env ]; then
  step ".env вече съществува — пазя тайните (базата остава)"
  chmod 600 .env
  ok "запазен"
else
  step "Няма .env — генерирам истински тайни"
  command -v openssl >/dev/null || die "openssl липсва (нужен за тайните)."
  cat > .env <<ENV
# АСО production env — генериран от autodeploy.sh $(date -u +%F)
POSTGRES_USER=aso
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=aso
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
INTERNAL_API_SECRET=$(openssl rand -hex 24)
CORS_ORIGINS=https://${DOMAIN}
# Конвенция: PUBLIC_WEB_URL = само origin, WEB_BASE_PATH = пътят на SPA-то.
# (Стар .env с PUBLIC_WEB_URL=…/app продължава да работи — API-то не дублира /app.)
PUBLIC_WEB_URL=https://${DOMAIN}
WEB_BASE_PATH=/app
PUBLIC_API_URL=https://${DOMAIN}
COOKIE_DOMAIN=
BOOTSTRAP_OWNER_EMAIL=${OWNER_EMAIL}
# Stripe — празно = магазинът показва „отваря скоро“ (Фаза 1). Попълни за Фаза 2.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
# Сложи true САМО след като зададеш Terms-of-service URL в Stripe Dashboard.
STRIPE_TOS_CONFIGURED=false
# true САМО след активиран Stripe Tax + регистрация за ДДС/OSS.
STRIPE_AUTOMATIC_TAX=false
# ── По желание (продукцията работи и без тях) ────────────────────────────────
# Имейл (потвърждение/смяна на парола). Празен SMTP_HOST => имейлите се логват.
# 587 + SMTP_SECURE=false (STARTTLS) или 465 + SMTP_SECURE=true.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=false
# Социален вход (и двете половини трябва да са зададени).
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
# Discord админ известия.
DISCORD_WEBHOOK_URL=
# Sentry следене на грешки.
SENTRY_DSN=
# ── SEO / аналитика (маркетинг сайтът — вграждат се при билд) ─────────────────
# Plausible (cookieless, GDPR-чист): сложи домейна, за да се включи. Празно = без трекери.
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
NEXT_PUBLIC_PLAUSIBLE_SRC=
# Google Analytics 4 (слага бисквитки — включи чак след consent механизъм).
NEXT_PUBLIC_GA_ID=
# Search Console / Bing — потвърждаване на собственост (мета таг).
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
NEXT_PUBLIC_BING_SITE_VERIFICATION=
ENV
  chmod 600 .env
  ok "нов .env с уникални тайни (пази го — от него зависи достъпът до базата)"
fi

# ── 3) билд ПРЕДИ свалянето: ако новият код не се билдва, старият стек остава
#      жив и работещ; успешният билд се кешира и прави следващото up мигновено.
#      Преди това образите на работещата версия получават таг :rollback.
dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env "$@"; }
HAVE_ROLLBACK=0
for svc in $SERVICES; do
  if docker image inspect "${PROJECT}-${svc}:latest" >/dev/null 2>&1; then
    docker image tag "${PROJECT}-${svc}:latest" "${PROJECT}-${svc}:rollback"
    HAVE_ROLLBACK=1
  fi
done
[ "$HAVE_ROLLBACK" -eq 1 ] && ok "образите на текущата версия са запазени като :rollback"
step "Билд (старият стек остава жив, докато билдът тече)"
dc build
ok "билдът мина"

# ── 3б) бекъп на базата ПРЕДИ свалянето и преди миграциите на новия api ──────
envval() { local v; v="$(grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true)"; echo "${v:-$2}"; }
PG_USER="$(envval POSTGRES_USER aso)"
PG_DB="$(envval POSTGRES_DB aso)"
BACKUP_FILE=""
pg_container() { # работещ postgres на нашия или на legacy проекта
  local proj id
  for proj in "$PROJECT" infra; do
    id="$(docker ps -q --filter label=com.docker.compose.project="$proj" --filter label=com.docker.compose.service=postgres | head -1)"
    [ -n "$id" ] && { echo "$id"; return 0; }
  done
  return 1
}
if [ "${SKIP_BACKUP:-0}" = "1" ]; then
  warn "SKIP_BACKUP=1 — БЕЗ бекъп на базата (само съзнателно!)"
elif [ -n "$LIVE_VOL" ]; then
  step "Бекъп на базата (pg_dump) → $BACKUP_DIR"
  PG_ID="$(pg_container || true)"
  if [ -z "$PG_ID" ] && docker volume inspect "${PROJECT}_aso_pgdata" >/dev/null 2>&1; then
    dc up -d postgres >/dev/null
    for _ in $(seq 1 30); do
      PG_ID="$(pg_container || true)"
      [ -n "$PG_ID" ] && docker exec "$PG_ID" pg_isready -U "$PG_USER" >/dev/null 2>&1 && break
      sleep 2
    done
  fi
  [ -n "$PG_ID" ] || die "Има база ($LIVE_VOL), но не успях да вдигна postgres за бекъп — деплоят спира (SKIP_BACKUP=1 за съзнателно пропускане)."
  mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/aso-$(date -u +%Y%m%dT%H%M%SZ).dump"
  old_umask="$(umask)"; umask 077
  if docker exec "$PG_ID" pg_dump -U "$PG_USER" -d "$PG_DB" --format=custom --no-owner > "$BACKUP_FILE" \
     && [ -s "$BACKUP_FILE" ]; then
    umask "$old_umask"
    ok "бекъп: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  else
    umask "$old_umask"
    rm -f "$BACKUP_FILE"
    die "pg_dump се провали — старият стек остава жив, деплоят спира."
  fi
  # ротация: пази последните $BACKUP_KEEP
  ls -1t "$BACKUP_DIR"/aso-*.dump 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -f || true
else
  ok "няма база още (първо пускане) — бекъп не е нужен"
fi

# ── 4) свали стария стек чисто (вкл. legacy „infra“ проект) ──────────────────
step "Свалям стария стек"
dc down --remove-orphans 2>/dev/null || true
# legacy: по-ранни пускания ползваха проект „infra“ (по името на папката)
if docker ps -a --format '{{.Names}}' | grep -q '^infra-'; then
  warn "намерен стар „infra“ стек — свалям и него, за да освободя портовете"
  docker compose -p infra -f "$COMPOSE_FILE" --env-file .env down --remove-orphans 2>/dev/null || \
    docker rm -f $(docker ps -aq --filter 'label=com.docker.compose.project=infra') 2>/dev/null || true
fi
ok "портовете са свободни"

# ── 5) еднократна миграция на legacy обемите (живата база от проект „infra“) ─
#     Copy-on-first-run: оригиналът остава непипнат като вграден бекъп.
for v in aso_pgdata aso_redisdata; do
  if docker volume inspect "infra_${v}" >/dev/null 2>&1 \
     && ! docker volume inspect "${PROJECT}_${v}" >/dev/null 2>&1; then
    step "Мигрирам обем infra_${v} → ${PROJECT}_${v} (оригиналът остава като бекъп)"
    docker volume create "${PROJECT}_${v}" >/dev/null
    docker run --rm -v "infra_${v}:/from:ro" -v "${PROJECT}_${v}:/to" alpine \
      sh -c 'cd /from && cp -a . /to/'
    ok "готово — изтрий infra_${v} ръчно ЧАК след потвърден здрав деплой"
  fi
done

# ── 6) вдигане ───────────────────────────────────────────────────────────────
step "Старт на новия стек"
dc up -d
ok "контейнерите са пуснати"

# ── 7) изчакай здравето ──────────────────────────────────────────────────────
step "Проверявам здравето (api пуска и миграциите при старт)"
# ВАЖНО: '|| true' е вътре в substitution-а — под pipefail grep без съвпадение
# иначе убива скрипта ТИХО точно тук (възпроизведен бъг).
getport() { envval "$1" "$2"; }
API_PORT="$(getport API_HOST_PORT 4500)"
WEB_PORT="$(getport WEB_HOST_PORT 4502)"
MK_PORT="$(getport MK_HOST_PORT 8090)"
RT_PORT="$(getport RT_HOST_PORT 4501)"

wait_ok() { # url label [service] [tries]
  for _ in $(seq 1 "${4:-60}"); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || echo 000)
    [ "$code" = "200" ] && { ok "$2 (200)"; return 0; }
    sleep 3
  done
  warn "$2 не отговори с 200 навреме — виж: docker compose -p $PROJECT logs ${3:-}"
  return 1
}
check_all() { # [tries] → брой здрави в HEALTHY
  HEALTHY=0
  wait_ok "http://127.0.0.1:${API_PORT}/health" "api" "api" "${1:-60}" && HEALTHY=$((HEALTHY+1))
  wait_ok "http://127.0.0.1:${WEB_PORT}/app/"  "web (игри)" "web" "${1:-60}" && HEALTHY=$((HEALTHY+1))
  wait_ok "http://127.0.0.1:${MK_PORT}/"       "marketing" "marketing" "${1:-60}" && HEALTHY=$((HEALTHY+1))
  # realtime: Engine.IO handshake връща 200 при жива WebSocket услуга
  wait_ok "http://127.0.0.1:${RT_PORT}/socket.io/?EIO=4&transport=polling" "realtime" "realtime" "${1:-60}" && HEALTHY=$((HEALTHY+1))
}
check_all 60

echo
dc ps

# ── 7б) нездрав → откат към предишните образи ────────────────────────────────
ROLLED_BACK=0
if [ "$HEALTHY" -ne 4 ] && [ "$HAVE_ROLLBACK" -eq 1 ] && [ "${NO_ROLLBACK:-0}" != "1" ]; then
  step "Новата версия не е здрава — връщам предишните образи"
  dc logs --tail 80 api realtime 2>/dev/null | tail -n 120 || true
  for svc in $SERVICES; do
    docker image inspect "${PROJECT}-${svc}:rollback" >/dev/null 2>&1 \
      && docker image tag "${PROJECT}-${svc}:rollback" "${PROJECT}-${svc}:latest"
  done
  dc up -d --no-build --force-recreate $SERVICES
  check_all 40
  ROLLED_BACK=1
fi

# ── 8) nginx (само при първо пускане — не пипаме certbot-редактирания файл) ───
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}"
echo
if command -v nginx >/dev/null; then
  if [ ! -e "$NGINX_SITE" ] && [ ! -e "$NGINX_LINK" ]; then
    step "Първи път: инсталирам nginx конфиг за $DOMAIN"
    # портовете на upstream-ите идват от .env (същите, които публикува compose)
    sed -e "s#127.0.0.1:4500;#127.0.0.1:${API_PORT};#" -e "s#127.0.0.1:4501;#127.0.0.1:${RT_PORT};#" \
        -e "s#127.0.0.1:4502;#127.0.0.1:${WEB_PORT};#" -e "s#127.0.0.1:8090;#127.0.0.1:${MK_PORT};#" \
        -e "s#server_name gaming.carbonstealth.eu;#server_name ${DOMAIN};#" \
        infra/nginx/aso.conf > "$NGINX_SITE"
    ln -sf "$NGINX_SITE" "$NGINX_LINK"
    if nginx -t 2>/dev/null; then
      systemctl reload nginx && ok "nginx конфигуриран и презареден"
      warn "Пусни еднократно TLS: certbot --nginx -d ${DOMAIN}"
    else
      rm -f "$NGINX_LINK" "$NGINX_SITE"
      warn "nginx -t се провали — премахнах новия конфиг (nginx остава как беше); чисти дублирани upstream aso_* в sites-enabled/ и пусни пак"
    fi
  else
    ok "nginx конфиг вече съществува — не го пипам (пази TLS блока на certbot)"
    # тихо разминаване = 502 за част от сайта; само предупреждаваме, не редактираме
    for pair in "aso_api:${API_PORT}" "aso_realtime:${RT_PORT}" "aso_web:${WEB_PORT}" "aso_marketing:${MK_PORT}"; do
      up="${pair%%:*}"; port="${pair##*:}"
      if [ -e "$NGINX_SITE" ] && ! grep -Eq "upstream ${up} +\{ *server 127\.0\.0\.1:${port};" "$NGINX_SITE"; then
        warn "nginx upstream ${up} не сочи към 127.0.0.1:${port} (от .env) — поправи $NGINX_SITE и nginx -s reload"
      fi
    done
  fi
else
  warn "nginx не е инсталиран — портовете са само на 127.0.0.1; сложи reverse proxy за публичен достъп"
fi

# ── край ─────────────────────────────────────────────────────────────────────
echo
EXIT=0
if [ "$ROLLED_BACK" -eq 1 ]; then
  c "1;31" "✗ Новата версия не мина проверката — върнах предишната (здрави: $HEALTHY/4)."
  [ -n "$BACKUP_FILE" ] && warn "Ако новият api вече е мигрирал схемата и старата версия не я понася, възстанови: docker exec -i \$(docker ps -q --filter label=com.docker.compose.service=postgres --filter label=com.docker.compose.project=${PROJECT}) pg_restore -U ${PG_USER} -d ${PG_DB} --clean --if-exists < ${BACKUP_FILE}"
  EXIT=1
elif [ "$HEALTHY" -eq 4 ]; then
  c "1;32" "✔ Деплоят е готов — https://${DOMAIN} (игри: /app)"
else
  c "1;31" "✗ Стекът е вдигнат, но не всичко върна 200 (няма предишна версия за откат) — виж логовете."
  EXIT=1
fi
cat <<TIP

Полезно:
  • Логове:        docker compose -p ${PROJECT} -f ${COMPOSE_FILE} --env-file .env logs -f api
  • Бекъпи:        ${BACKUP_DIR} (последните ${BACKUP_KEEP}; ръчно: SKIP_BACKUP=0 bash infra/autodeploy.sh)
  • Статус:        docker compose -p ${PROJECT} -f ${COMPOSE_FILE} --env-file .env ps
  • OWNER роля:    регистрирай се на сайта с ${OWNER_EMAIL} ВЕДНАГА след деплоя, после
                   docker compose -p ${PROJECT} -f ${COMPOSE_FILE} --env-file .env restart api
                   и влез наново → OWNER (повишаването става при старта на api;
                   BOOTSTRAP_OWNER_EMAIL в .env). Ако имейлът е „зает“ — някой те е
                   изпреварил: НЕ рестартирай, изтрий акаунта през psql.
TIP
exit "$EXIT"
