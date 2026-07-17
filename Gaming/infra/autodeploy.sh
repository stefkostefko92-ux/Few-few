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
#   3. БИЛДВА ПРЕДИ да сваля стария стек — провален билд оставя продукцията жива.
#   4. Сваля стария стек (вкл. legacy `infra` проект) и МИГРИРА обемите му еднократно
#      (копие; оригиналът остава като бекъп) → живата база се пренася, не се губи.
#   5. Вдига новия стек и проверява здравето на 4-те услуги (api/web/marketing/realtime).
#   6. При ПЪРВО пускане предлага nginx конфиг + сочи към certbot (после НЕ пипа
#      nginx; провален nginx -t премахва новия конфиг, за да не остане счупен).
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

command -v docker >/dev/null || die "Docker липсва. Инсталирай: curl -fsSL https://get.docker.com | sh"
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
if [ ! -f .env ] && docker volume inspect infra_aso_pgdata >/dev/null 2>&1; then
  step "Жива legacy база (infra_aso_pgdata) без .env — търся старите тайни"
  for cand in "${LEGACY_ENV:-}" "$SRC_DIR/.env" /root/Few-few-main/Gaming/.env; do
    if [ -n "$cand" ] && [ -f "$cand" ] && grep -q '^POSTGRES_PASSWORD=' "$cand"; then
      cp "$cand" .env && chmod 600 .env
      ok "приех стария .env от $cand (пази паролата, с която е инициализирана базата)"
      break
    fi
  done
  [ -f .env ] || die "Жива база без .env! Копирай стария: cp <стар-архив>/Gaming/.env $DEPLOY_DIR/.env (или LEGACY_ENV=/path/to/.env bash infra/autodeploy.sh). Нови тайни = изоставена база и изчезнали акаунти."
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
PUBLIC_WEB_URL=https://${DOMAIN}/app
PUBLIC_API_URL=https://${DOMAIN}
COOKIE_DOMAIN=
BOOTSTRAP_OWNER_EMAIL=${OWNER_EMAIL}
# Stripe — празно = магазинът показва „отваря скоро“ (Фаза 1). Попълни за Фаза 2.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
# Сложи true САМО след като зададеш Terms-of-service URL в Stripe Dashboard.
STRIPE_TOS_CONFIGURED=false
# ── По желание (продукцията работи и без тях) ────────────────────────────────
# Имейл (потвърждение/смяна на парола). Празен SMTP_HOST => имейлите се логват.
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
#      жив и работещ (rollback по подразбиране); успешният билд се кешира и
#      прави следващото up мигновено.
step "Билд (старият стек остава жив, докато билдът тече)"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env build
ok "билдът мина"

# ── 4) свали стария стек чисто (вкл. legacy „infra“ проект) ──────────────────
step "Свалям стария стек"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env down --remove-orphans 2>/dev/null || true
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
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env up -d --build
ok "контейнерите са пуснати"

# ── 7) изчакай здравето ──────────────────────────────────────────────────────
step "Проверявам здравето (api пуска и миграциите при старт)"
# ВАЖНО: '|| true' е вътре в substitution-а — под pipefail grep без съвпадение
# иначе убива скрипта ТИХО точно тук (възпроизведен бъг).
getport() { local v; v="$(grep -E "^$1=" .env | cut -d= -f2- || true)"; echo "${v:-$2}"; }
API_PORT="$(getport API_HOST_PORT 4500)"
WEB_PORT="$(getport WEB_HOST_PORT 4502)"
MK_PORT="$(getport MK_HOST_PORT 8090)"
RT_PORT="$(getport RT_HOST_PORT 4501)"

wait_ok() { # url label
  for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || echo 000)
    [ "$code" = "200" ] && { ok "$2 (200)"; return 0; }
    sleep 3
  done
  warn "$2 не отговори с 200 навреме — виж: docker compose -p $PROJECT logs ${3:-}"
  return 1
}
HEALTHY=0
wait_ok "http://127.0.0.1:${API_PORT}/health" "api" "api" && HEALTHY=$((HEALTHY+1))
wait_ok "http://127.0.0.1:${WEB_PORT}/app/"  "web (игри)" "web" && HEALTHY=$((HEALTHY+1))
wait_ok "http://127.0.0.1:${MK_PORT}/"       "marketing" "marketing" && HEALTHY=$((HEALTHY+1))
# realtime: Engine.IO handshake връща 200 при жива WebSocket услуга
wait_ok "http://127.0.0.1:${RT_PORT}/socket.io/?EIO=4&transport=polling" "realtime" "realtime" && HEALTHY=$((HEALTHY+1))

echo
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env ps

# ── 8) nginx (само при първо пускане — не пипаме certbot-редактирания файл) ───
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}"
echo
if command -v nginx >/dev/null; then
  if [ ! -e "$NGINX_SITE" ] && [ ! -e "$NGINX_LINK" ]; then
    step "Първи път: инсталирам nginx конфиг за $DOMAIN"
    cp infra/nginx/aso.conf "$NGINX_SITE"
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
  fi
else
  warn "nginx не е инсталиран — портовете са само на 127.0.0.1; сложи reverse proxy за публичен достъп"
fi

# ── край ─────────────────────────────────────────────────────────────────────
echo
if [ "$HEALTHY" -eq 4 ]; then
  c "1;32" "✔ Деплоят е готов — https://${DOMAIN} (игри: /app)"
else
  c "1;33" "⚠ Стекът е вдигнат, но не всичко върна 200 — виж логовете по-горе."
fi
cat <<TIP

Полезно:
  • Логове:        docker compose -p ${PROJECT} -f ${COMPOSE_FILE} --env-file .env logs -f api
  • Статус:        docker compose -p ${PROJECT} -f ${COMPOSE_FILE} --env-file .env ps
  • OWNER роля:    регистрирай се на сайта с ${OWNER_EMAIL} → ставаш OWNER автоматично
                   (BOOTSTRAP_OWNER_EMAIL в .env; иначе ръчно през psql).
TIP
