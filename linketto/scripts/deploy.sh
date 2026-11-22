#!/usr/bin/env bash
# Деплой на Linketto — идемпотентен, викан от `deploy/autodeploy.sh` или на ръка
# от папката на продукта (като root, `.env` до docker-compose.yml):
#
#   sudo bash scripts/deploy.sh
#
# Редът НЕ е произволен:
#   бекъп → билд на новия образ → база → миграции с НОВИЯ образ (ролята собственик) →
#   ролята на приложението (linketto_app) → смяна на app → сонда.
# Докато се строи и мигрира, старият app продължава да обслужва (миграциите ни са
# адитивни — старият код работи и с новата схема). Бекъпът е ПРЕДИ миграцията,
# защото след нея е закъснял.
#
# Изходни кодове (autodeploy.sh решава по тях дали има откат):
#   0 — новият код отговаря на сондата
#   2 — спряно ПРЕДИ смяната (липсва .env, бекъп, билд, база) — работи старият код
#   4 — миграцията падна — работи старият код, схемата може да е частично мигрирана
#   5 — новият app е вдигнат, но не минава сондата — нужен е откат на кода
set -euo pipefail
cd "$(dirname "$0")/.."

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
fail() { local rc="$1"; shift; printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit "$rc"; }

DATA_HOST="${LINKETTO_DATA_HOST:-/opt/few-few/shared/linketto/data}"
KEEP_DUMPS="${LINKETTO_KEEP_DUMPS:-10}"
SKIP_BACKUP="${LINKETTO_SKIP_BACKUP:-0}"

[ -f .env ] || fail 2 "Няма linketto/.env — тайните живеят на сървъра (/opt/few-few/shared/linketto/.env, виж DEPLOY.md §7)."
chmod 600 .env 2>/dev/null || true
grep -qE '^POSTGRES_PASSWORD=.+' .env || fail 2 "В .env липсва POSTGRES_PASSWORD."

# Паролата на ролята на приложението (linketto_app, DEPLOY.md §7 „Роли в базата“). Генерира се веднъж,
# ако липсва — ПРЕДИ първото `docker compose` (compose файлът я иска за app). Само hex: влиза в
# DATABASE_URL и в SQL без екраниране. Дописва се с водещ нов ред: ред, залепен към последната
# стойност без краен нов ред, би я повредил тихо.
APP_DB_PASSWORD="$(sed -n 's/^APP_DB_PASSWORD=//p' .env | tail -1 | tr -d "\"' \r")"
if [ -z "$APP_DB_PASSWORD" ]; then
  APP_DB_PASSWORD="$(openssl rand -hex 32 2>/dev/null || true)"
  [ "${#APP_DB_PASSWORD}" -eq 64 ] || fail 2 "openssl не даде парола за linketto_app — спирам, вместо да пиша слаба."
  # --follow-symlinks: на сървъра .env е симлинк към /opt/few-few/shared/linketto/.env — голо `sed -i`
  # би подменило симлинка с обикновен файл в release-а и паролата нямаше да стигне до общия файл.
  sed -i --follow-symlinks '/^APP_DB_PASSWORD=/d' .env
  printf '\n# Ролята на приложението в базата (без DDL; DEPLOY.md §7). Генерирана от scripts/deploy.sh.\n' >> .env
  printf 'APP_DB_PASSWORD=%s\n' "$APP_DB_PASSWORD" >> .env
  ok "APP_DB_PASSWORD е генерирана (ролята linketto_app)."
fi
[[ "$APP_DB_PASSWORD" =~ ^[0-9a-f]{32,128}$ ]] \
  || fail 2 "APP_DB_PASSWORD в .env трябва да е hex (32–128 знака) — например openssl rand -hex 32."

# Портът на хоста: HTTP_PORT от .env (същото чете docker-compose.yml), иначе 4350.
PORT="$(sed -n 's/^HTTP_PORT=//p' .env | tail -1 | tr -dc '0-9' || true)"
PORT="${PORT:-4350}"
HEALTH_URL="${LINKETTO_HEALTH_URL:-http://127.0.0.1:${PORT}/api/health}"

if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else fail 2 "Липсва Docker Compose."; fi
command -v curl >/dev/null 2>&1 || fail 2 "Липсва curl (нужен за сондата)."

# Порт, зает от ДРУГ процес, се хваща ТУК — преди бекъп, билд и миграции. Иначе всичко минава,
# а app-ът пада чак на `up` с „port is already allocated“ (17.11.2026: 4340 беше на rilievi).
# Нашият работещ app също слуши на порта — той е разрешен (откриваме го по етикетите на Compose).
# Проба с bash /dev/tcp (не `ss`: iproute2 го няма във всяка среда) — връзка = някой слуша.
if timeout 3 bash -c "exec 3<>/dev/tcp/127.0.0.1/$PORT" 2>/dev/null; then
  holder="$(docker ps --filter "publish=$PORT" \
    --format '{{.Label "com.docker.compose.project"}}/{{.Label "com.docker.compose.service"}}' 2>/dev/null | head -1 || true)"
  [ "$holder" = "linketto/app" ] \
    || fail 2 "Порт 127.0.0.1:$PORT е зает от ${holder:-процес извън Docker} — сложи свободен HTTP_PORT в .env (виж: ss -ltnp 'sport = :$PORT')."
fi

# ── 0) Папката за качени снимки — стабилен път извън release-а ─────────────────
# Създадена от Docker при bind, тя би била root:root и качването тихо би падало.
# Симлинк не се следва като root (CWE-59): отказ и човек.
if [ -L "$DATA_HOST" ]; then
  fail 2 "$DATA_HOST е СИМЛИНК — отказвам да сменям собственика му; провери ръчно."
fi
if [ "$(id -u)" = "0" ]; then
  install -d -o 1001 -g 1001 -m 750 "$DATA_HOST"
elif [ ! -d "$DATA_HOST" ]; then
  fail 2 "Няма $DATA_HOST, а без root не мога да я създам (собственик 1001:1001)."
fi

# ── 1) Бекъп ПРЕДИ да пипаме каквото и да е ──────────────────────────────────
# `backups/` е симлинк към стабилен път извън releases (слага го autodeploy).
mkdir -p backups
chmod 700 backups 2>/dev/null || true

# СЪЩЕСТВУВА ли база (не „върви ли“): без `-a` спрян контейнер с жив том
# изглежда като „няма база“ и миграцията минава без бекъп.
HAS_DB="$($DC ps -aq db 2>/dev/null || true)"
if [ "$SKIP_BACKUP" = "1" ]; then
  warn "LINKETTO_SKIP_BACKUP=1 — без нов дъмп (само при откат на кода)."
elif [ -n "$HAS_DB" ]; then
  # `up -d db` САМО ако базата е спряна: върху работещ контейнер със стара конфигурация (друг образ,
  # мрежа, read_only) `up` би го ПРЕСЪЗДАЛ преди дъмпа — ако новият не тръгне, остава без база и без
  # бекъп. Дъмпът се прави от работещия контейнер какъвто е; смяната на конфигурацията е в стъпка 3.
  if [ -z "$($DC ps -q --status running db 2>/dev/null || true)" ]; then
    $DC up -d db >/dev/null 2>&1 || true
  fi
  for i in $(seq 1 30); do
    $DC exec -T db pg_isready -U linketto -d linketto >/dev/null 2>&1 && break
    [ "$i" = "30" ] && fail 2 "Базата съществува, но не отговаря — спирам ПРЕДИ миграцията, вместо да мигрирам без бекъп."
    sleep 2
  done

  BK="backups/pre-deploy-$(date +%Y%m%d-%H%M%S).sql.gz"
  if ( umask 077; $DC exec -T db pg_dump -U linketto linketto | gzip > "$BK" ); then
    # `[ -s ]` не стига: gzip на празен вход дава валиден файл от ~20 байта.
    # Проверява се разархивираният размер и реална схема вътре. `grep -c`, не
    # `grep -q`: `-q` затваря рано → gzip получава SIGPIPE → под pipefail
    # валиден дъмп се чете като провал (измерено при FiveM).
    RAW="$(gzip -dc "$BK" | wc -c)" || RAW=0
    TABLES="$(gzip -dc "$BK" | grep -c 'CREATE TABLE')" || TABLES=0
    if [ "${RAW:-0}" -lt 2000 ] || [ "${TABLES:-0}" -lt 1 ]; then
      rm -f "$BK"
      fail 2 "Бекъпът е празен или без схема (${RAW:-0} б. разархивирани, ${TABLES:-0} таблици) — спирам ПРЕДИ миграцията."
    fi
    ok "Бекъп: $BK ($(du -h "$BK" | cut -f1), ${RAW} б. разархивирани, ${TABLES} таблици)"
    # Пазим последните KEEP_DUMPS дъмпа отпреди деплой — иначе дискът свършва
    # мълчаливо. Трият се само файлове с този шаблон, никога нещо друго.
    { ls -1t backups/pre-deploy-*.sql.gz 2>/dev/null || true; } | tail -n +$((KEEP_DUMPS + 1)) | while read -r old; do
      rm -f -- "$old"
    done
  else
    rm -f "$BK"
    fail 2 "pg_dump се провали — спирам преди миграцията."
  fi
else
  warn "Няма контейнер за базата (пръв деплой) — няма какво да се бекъпва."
fi

# ── 2) Билд на новия образ — старият app продължава да върви ─────────────────
log "Строя образа на app…"
$DC build app || fail 2 "Билдът падна — работи старият код."

# ── 3) База ──────────────────────────────────────────────────────────────────
log "Вдигам базата…"
$DC up -d db || fail 2 "Базата не тръгна."
for i in $(seq 1 30); do
  $DC exec -T db pg_isready -U linketto -d linketto >/dev/null 2>&1 && break
  [ "$i" = "30" ] && fail 2 "Базата не се вдигна за 60 s."
  sleep 2
done
ok "Базата отговаря."

# ── 4) Миграции с НОВИЯ образ, в еднократен контейнер, ПРЕДИ смяната на app ──
# Услугата `migrate` (docker-compose.yml): същият образ, но с ролята СОБСТВЕНИК — app няма DDL права.
log "Пускам миграциите (prisma migrate deploy, ролята собственик)…"
$DC run --rm --no-deps -T migrate \
  || fail 4 "Миграцията падна — работи старият код. Бекъпът отпреди нея е в backups/ (DEPLOY.md §7, „Провалена миграция“)."

# ── 4б) Ролята на приложението и правата ѝ — СЛЕД миграциите (новите таблици също) ──
# Идемпотентно при всеки деплой. Като собственика през локалния сокет на контейнера (без парола
# в argv). Паролата стига до psql през stdin (`\set`), не като аргумент — `ps` вижда argv.
# Без SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS; без CREATE в схемата; `_prisma_migrations`
# — само четене. ALTER DEFAULT PRIVILEGES покрива таблиците от бъдещи миграции (собственик linketto).
log "Ролята на приложението (linketto_app)…"
$DC exec -T db psql -X -q -U linketto -d linketto -v ON_ERROR_STOP=1 >/dev/null <<SQL \
  || fail 2 "Ролята linketto_app не се настрои — работи старият код (схемата вече е мигрирана; миграциите са адитивни)."
\set app_pw '${APP_DB_PASSWORD}'
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'linketto_app') THEN
    CREATE ROLE linketto_app LOGIN;
  END IF;
END \$\$;
ALTER ROLE linketto_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  NOINHERIT CONNECTION LIMIT 50 PASSWORD :'app_pw';
REVOKE ALL ON DATABASE linketto FROM PUBLIC;
GRANT CONNECT ON DATABASE linketto TO linketto_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO linketto_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO linketto_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO linketto_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public."_prisma_migrations" FROM linketto_app;
ALTER DEFAULT PRIVILEGES FOR ROLE linketto IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO linketto_app;
ALTER DEFAULT PRIVILEGES FOR ROLE linketto IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO linketto_app;
SQL
ok "linketto_app: без SUPERUSER/CREATEDB, само DML."

# ── 5) Смяна на app ──────────────────────────────────────────────────────────
log "Вдигам новия app…"
$DC up -d app || fail 5 "Новият app не тръгна."

# ── 6) Сонда: 200 + маркер на приложението + жива база ───────────────────────
log "Чакам $HEALTH_URL…"
body=""
for i in $(seq 1 45); do
  body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
  case "$body" in
    *'"app":"linketto"'*'"db":"up"'*|*'"db":"up"'*'"app":"linketto"'*)
      ok "Linketto отговаря: $body"
      exit 0
      ;;
  esac
  sleep 2
done
warn "Последен отговор: ${body:-(няма)}"
$DC logs --no-color --tail 60 app 2>/dev/null || true
fail 5 "Сондата не мина за 90 s — нужен е откат на кода."
