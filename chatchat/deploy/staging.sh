#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/staging.sh — STAGING на ChatChat (спец. §17.1: „test integrati + evaluation set“) на
# същата машина, НАПЪЛНО отделно от продукцията:
#   · същият docker-compose.yml, друг compose проект — `chatchat-staging` (свои контейнери, мрежи, томове,
#     база, антивирус, образ на app);
#   · тайни и данни в /opt/few-few/shared/chatchat-staging (.env 600 — собствени ключове, никога тези на
#     продукцията; скриптът отказва, ако някоя тайна съвпада);
#   · порт 127.0.0.1:4331 (регистърът на портовете — deploy/README.md); vhost
#     staging-chatchat.carbonstealth.eu (TLS, noindex, само с basic auth или IP allowlist).
#
#   sudo REF=<клон> PROJECTS="chatchat-staging" bash /opt/few-few/current/deploy/fetch-deploy.sh
#   sudo bash /opt/few-few/releases/<час>/<корен>/chatchat/deploy/staging.sh          # ръчно
#
# Ред: копие на chatchat/ от release-а в $SHARED/releases/<час> (отделна работна папка — .env на staging
# никога не стъпва в папката, от която се командва продукцията) → .env (ражда се при пръв пуск) → пазачи
# (проект, папка, порт, тайни ≠ продукцията) → файловете за достъп на nginx → deploy.sh от копието (бекъп
# преди миграция, build, up, сонда на /readyz, vhost-ът от репото) → оценъчният набор (evals/) срещу
# ОТДЕЛНА тестова база в staging Postgres → отчетът в $SHARED/eval-reports → last-good.
#
# Изход: 0 — жив и оценката е зелена; 4 — контейнерите са сменени, но не отговаря (autodeploy връща
# last-good на staging); 5 — жив, но оценката е червена (нарушение на безопасността или грешка в
# прогона): остава вдигнат за преглед, last-good НЕ се мести; 1 — спрян преди смяната (работещият
# staging не е пипан). Продукцията (compose проект `chatchat`) не се пипа в нито един случай.
#
# STAGING_SKIP_EVAL=1 — само за отката на autodeploy (кодът на last-good вече е минал оценката).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SRC_APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Името на проекта е заковано: никаква настройка не може да насочи staging към `chatchat`.
readonly PROJECT=chatchat-staging
SHARED="${CHATCHAT_STAGING_SHARED:-/opt/few-few/shared/chatchat-staging}"
PROD_SHARED="${CHATCHAT_PROD_SHARED:-/opt/few-few/shared/chatchat}"
DOMAIN="${CHATCHAT_STAGING_DOMAIN:-staging-chatchat.carbonstealth.eu}"
DEFAULT_PORT=4331
ACCESS_DIR="${CHATCHAT_STAGING_ACCESS_DIR:-/etc/nginx/chatchat-staging}"
NGINX_SITE="${CHATCHAT_STAGING_NGINX_SITE:-/etc/nginx/sites-available/chatchat-staging}"
NGINX_LINK="${CHATCHAT_STAGING_NGINX_LINK:-/etc/nginx/sites-enabled/chatchat-staging}"
LOG_DIR="${CHATCHAT_LOG_DIR:-/var/log/chatchat}"
KEEP_COPIES="${CHATCHAT_STAGING_KEEP:-3}"
KEEP_REPORTS="${CHATCHAT_STAGING_KEEP_REPORTS:-30}"
EVAL_TIMEOUT="${CHATCHAT_EVAL_TIMEOUT:-1800}"
# Името съдържа „test“ — без това evals/run.ts отказва (той я ИЗЧИСТВА). Никога `chatchat`.
readonly EVAL_DB=chatchat_eval_test
EVAL_IMAGE="${CHATCHAT_EVAL_IMAGE:-chatchat-staging-eval:latest}"
SKIP_EVAL="${STAGING_SKIP_EVAL:-0}"
TS="$(date +%Y%m%d-%H%M%S)"
ENV_FILE="$SHARED/.env"
PROD_ENV="$PROD_SHARED/.env"
WORK_ROOT="$SHARED/releases"
APP=""

log() { printf '\033[1;36m▸ chatchat-staging: %s\033[0m\n' "$*"; }
ok() { printf '\033[32m✔ chatchat-staging: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ chatchat-staging: %s\033[0m\n' "$*" >&2; }
fail() {
  local code="$1"
  shift
  printf '\033[31m✘ chatchat-staging: %s\033[0m\n' "$*" >&2
  exit "$code"
}

# Стойност от env файл, без той да се изпълнява. Не се печата.
env_get() {
  local v
  [ -f "$1" ] || return 0
  v="$(sed -n "s/^$2=//p" "$1" | tail -n 1 | tr -d '\r')" || v=""
  v="${v%\"}" && v="${v#\"}" && v="${v%\'}" && v="${v#\'}"
  printf '%s' "$v"
}

# Работната папка на този пробег: копие на chatchat/ от release-а — освен ако скриптът вече тече от
# копие (откатът на autodeploy пуска staging.sh на last-good): тогава на място. `.env` от release-а (ако
# продукцията е разгърната от същия) не влиза в копието — там стои само .env на staging.
prepare_copy() {
  case "$SRC_APP/" in
    "$WORK_ROOT"/*)
      APP="$SRC_APP"
      return 0
      ;;
  esac
  local dest="$WORK_ROOT/$TS"
  [ ! -e "$dest" ] || dest="$dest-$$"
  install -d -m 700 "$WORK_ROOT" "$dest"
  cp -a "$SRC_APP/." "$dest/" || fail 1 "копието на release-а в $dest не стана."
  rm -f "$dest/.env"
  APP="$dest"
}

# Първи пуск: .env на staging се ражда тук — СОБСТВЕНИ случайни ключове (продукцията не се чете за
# тях). Само ако томът на базата на staging го няма: съществуващ том с изгубен .env иска човек
# (новата парола не би отворила старата база). ATTACHMENT_URL_KEY/MFA_ENC_KEY/FILES_KEK ги ражда deploy.sh.
bootstrap_env() {
  [ -f "$ENV_FILE" ] && return 0
  if docker volume inspect "${PROJECT}_db-data" >/dev/null 2>&1; then
    fail 1 "няма $ENV_FILE, а томът ${PROJECT}_db-data съществува — паролата му не се измисля. Върни .env или (данните са тестови) махни тома ръчно: docker volume rm ${PROJECT}_db-data"
  fi
  command -v openssl >/dev/null 2>&1 || fail 1 "няма openssl — .env на staging не може да се роди."
  install -d -m 700 "$SHARED"
  {
    printf '# ChatChat STAGING — роден от deploy/staging.sh (%s). Собствени ключове; никога тези на продукцията.\n' "$TS"
    printf 'COMPOSE_PROJECT_NAME=%s\n' "$PROJECT"
    printf 'CHATCHAT_SHARED=%s\n' "$SHARED"
    printf 'HTTP_PORT=%s\n' "$DEFAULT_PORT"
    printf 'PUBLIC_BASE_URL=https://%s\n' "$DOMAIN"
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'SESSION_PEPPER=%s\n' "$(openssl rand -hex 32)"
    printf 'VERTEX_REGION=eu\n'
    printf '# Оценъчният набор след всеки деплой: fake (детерминистичен модел, без разход) | real (Vertex)\n'
    printf 'STAGING_EVAL_MODEL=fake\n'
  } >"$ENV_FILE.tmp"
  chmod 600 "$ENV_FILE.tmp"
  mv -f "$ENV_FILE.tmp" "$ENV_FILE"
  ok "родих $ENV_FILE (600) със собствени ключове — AI (VERTEX_*, GCP_SA_FILE) се добавя там по избор"
}

# Пазачите — всичко ПРЕДИ първата промяна. Всеки провал е изход 1 (работещото не е пипано).
check_guards() {
  local named shared port prod_port metrics prod_metrics url prod_url same name v pv ours busy
  [ "$SHARED" != "$PROD_SHARED" ] || fail 1 "папката на staging е тази на продукцията ($SHARED)."
  case "$SHARED" in /*) ;; *) fail 1 "папката на staging трябва да е абсолютен път ($SHARED)." ;; esac
  chmod 600 "$ENV_FILE"

  # Проектът и папката: compose ги чете от .env (и ръчните команди от копието отиват в staging).
  named="$(env_get "$ENV_FILE" COMPOSE_PROJECT_NAME)"
  if [ -z "$named" ]; then
    printf 'COMPOSE_PROJECT_NAME=%s\n' "$PROJECT" >>"$ENV_FILE"
  elif [ "$named" != "$PROJECT" ]; then
    fail 1 "COMPOSE_PROJECT_NAME=$named в $ENV_FILE — staging е само $PROJECT."
  fi
  shared="$(env_get "$ENV_FILE" CHATCHAT_SHARED)"
  if [ -z "$shared" ]; then
    printf 'CHATCHAT_SHARED=%s\n' "$SHARED" >>"$ENV_FILE"
  elif [ "$shared" != "$SHARED" ]; then
    # иначе compose би монтирал чужди прикачени файлове/отчети (по подразбиране — тези на продукцията)
    fail 1 "CHATCHAT_SHARED=$shared в $ENV_FILE — трябва да е $SHARED."
  fi
  if grep -q '^COMPOSE_FILE=' "$ENV_FILE"; then
    fail 1 "COMPOSE_FILE в $ENV_FILE — staging е само docker-compose.yml (без шифрования том на продукцията)."
  fi

  # Портовете: никога тези на продукцията; зает порт от друго приложение → отказ преди build.
  port="$(env_get "$ENV_FILE" HTTP_PORT | tr -dc '0-9')"
  if [ -z "$port" ]; then
    port="$DEFAULT_PORT"
    printf 'HTTP_PORT=%s\n' "$port" >>"$ENV_FILE"
  fi
  prod_port="$(env_get "$PROD_ENV" HTTP_PORT | tr -dc '0-9')"
  prod_port="${prod_port:-4330}"
  [ "$port" != "$prod_port" ] || fail 1 "HTTP_PORT=$port е портът на продукцията — staging е на $DEFAULT_PORT (deploy/README.md, „Портове“)."
  metrics="$(env_get "$ENV_FILE" METRICS_PORT | tr -dc '0-9')"
  prod_metrics="$(env_get "$PROD_ENV" METRICS_PORT | tr -dc '0-9')"
  if [ -n "$metrics" ] && { [ "$metrics" = "$prod_metrics" ] || [ "$metrics" = "$port" ]; }; then
    fail 1 "METRICS_PORT=$metrics е зает от продукцията или от HTTP_PORT — друг или празно (случаен на 127.0.0.1)."
  fi
  if command -v ss >/dev/null 2>&1; then
    busy="$(ss -Hltn "sport = :$port" 2>/dev/null | head -n 1)" || busy=""
    ours="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "publish=$port" 2>/dev/null | head -n 1)" || ours=""
    if [ -n "$busy" ] && [ -z "$ours" ]; then
      fail 1 "порт $port е зает от друго приложение (ss -ltnp 'sport = :$port') — друг HTTP_PORT в $ENV_FILE."
    fi
  fi

  url="$(env_get "$ENV_FILE" PUBLIC_BASE_URL)"
  prod_url="$(env_get "$PROD_ENV" PUBLIC_BASE_URL)"
  [ -n "$url" ] || fail 1 "няма PUBLIC_BASE_URL в $ENV_FILE (https://$DOMAIN)."
  [ "$url" != "$prod_url" ] || fail 1 "PUBLIC_BASE_URL на staging е адресът на продукцията — https://$DOMAIN."

  # Тайните: нито една непразна стойност не е същата като в .env на продукцията (стойностите не се печатат).
  same=""
  if [ -f "$PROD_ENV" ]; then
    while IFS= read -r name; do
      v="$(env_get "$ENV_FILE" "$name")"
      [ -n "$v" ] || continue
      pv="$(env_get "$PROD_ENV" "$name")"
      [ "$v" != "$pv" ] || same="$same $name"
    done < <(sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$ENV_FILE" | grep -E 'PASSWORD|PEPPER|SECRET|TOKEN|_KEY|KEK' | sort -u)
  fi
  [ -z "$same" ] || fail 1 "staging носи тайните на продукцията:$same — нови (openssl rand) в $ENV_FILE."
  if [ -n "$(env_get "$ENV_FILE" GCP_SA_FILE)" ] && [ "$(env_get "$ENV_FILE" GCP_SA_FILE)" = "$(env_get "$PROD_ENV" GCP_SA_FILE)" ]; then
    warn "GCP_SA_FILE е ключът на продукцията — препоръка: отделен service account за staging (DEPLOY.md, „Staging“)."
  fi
  if [ -n "$(env_get "$ENV_FILE" BREVO_API_KEY)" ]; then
    warn "BREVO_API_KEY е зададен — staging праща ИСТИНСКИ имейли до потребителите си."
  fi
  return 0
}

# Файловете за достъп, които vhost-ът включва: allow.conf трябва да съществува (иначе `nginx -t` пада за
# ЦЯЛАТА машина). Празни = затворено за всички (401/403), никога отворено. Чете ги и nginx worker-ът
# (www-data) — затова групата му, без права за другите.
ensure_access() {
  local group=root
  getent group www-data >/dev/null 2>&1 && group=www-data
  install -d -m 750 -o root -g "$group" "$ACCESS_DIR"
  if [ ! -f "$ACCESS_DIR/allow.conf" ]; then
    printf '%s\n' '# Адресите с достъп до staging без парола: `allow <IP>;` на ред (DEPLOY.md, „Staging“).' \
      '# Празно = само с парола (htpasswd до този файл).' >"$ACCESS_DIR/allow.conf"
    chown "root:$group" "$ACCESS_DIR/allow.conf"
    chmod 640 "$ACCESS_DIR/allow.conf"
  fi
  if [ ! -s "$ACCESS_DIR/htpasswd" ] && ! grep -qE '^[[:space:]]*allow[[:space:]]' "$ACCESS_DIR/allow.conf"; then
    warn "staging е затворен за всички: няма $ACCESS_DIR/htpasswd и нито един адрес в allow.conf — DEPLOY.md, „Staging“."
  fi
}

# Пазим само последните копия + last-good + текущото (откатът и прегледът имат нужда от тях).
prune_copies() {
  local good d n=0
  good="$(head -n 1 "$SHARED/last-good" 2>/dev/null || true)"
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    d="${d%/}"
    n=$((n + 1))
    [ "$n" -gt "$KEEP_COPIES" ] || continue
    [ "$d" != "$good" ] && [ "$d" != "$APP" ] || continue
    case "$d" in "$WORK_ROOT"/2*) rm -rf -- "$d" ;; esac
  done < <(ls -1dt "$WORK_ROOT"/*/ 2>/dev/null || true)
}

prune_reports() {
  find "$SHARED/eval-reports" -maxdepth 1 -type f -name '*.json' -printf '%T@ %p\n' 2>/dev/null | sort -rn |
    tail -n "+$((KEEP_REPORTS + 1))" | cut -d' ' -f2- | xargs -r rm -f
  find "$SHARED/eval-runs" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -rn |
    tail -n "+$((KEEP_REPORTS + 1))" | cut -d' ' -f2- | xargs -r rm -rf --
}

# Тестовата база в Postgres на staging — създава се, ако я няма (оценката я изчиства при всеки прогон).
ensure_eval_db() {
  local have
  have="$(docker compose exec -T db psql -X -U chatchat -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$EVAL_DB'" 2>/dev/null | tr -dc '0-9')" || have=""
  [ "$have" = 1 ] && return 0
  docker compose exec -T db psql -X -q -v ON_ERROR_STOP=1 -U chatchat -d postgres -c "CREATE DATABASE $EVAL_DB" >/dev/null
}

# Оценъчният набор (evals/run.ts) в еднократен контейнер от стадия `build` на Dockerfile-а (същият
# изходен код и lockfile като app; кешът на build-а го прави евтин): само във вътрешната мрежа на
# staging (до базата), само за четене, без capabilities, като uid 1000. С STAGING_EVAL_MODEL=real — и
# мрежата с изход навън (Vertex AI в ЕС) + ключът на service account-а на staging. Отчетът (JSON + MD) →
# $SHARED/eval-runs/<час>/, JSON-ът → $SHARED/eval-reports/ (KPI таблото на staging го чете). Изход ≠ 0
# при нарушение на безопасността или грешка в прогона.
run_eval() {
  local mode set_host set_in net defnet out cid rc=0 pw sa flag="--fake" f copied=0
  mode="$(env_get "$ENV_FILE" STAGING_EVAL_MODEL)"
  mode="${mode:-fake}"
  case "$mode" in
    fake) ;;
    real)
      [ -n "$(env_get "$ENV_FILE" VERTEX_PROJECT_ID)" ] || {
        warn "STAGING_EVAL_MODEL=real без VERTEX_PROJECT_ID в $ENV_FILE"
        return 1
      }
      flag=""
      ;;
    *)
      warn "STAGING_EVAL_MODEL=$mode — позволени: fake | real"
      return 1
      ;;
  esac
  set_in="evals/sample.json"
  set_host="$(env_get "$ENV_FILE" STAGING_EVAL_SET)"
  if [ -n "$set_host" ]; then
    [ -f "$set_host" ] || {
      warn "STAGING_EVAL_SET=$set_host не съществува"
      return 1
    }
    set_in="/eval/set.json"
  fi
  log "оценъчният набор ($mode, $([ -n "$set_host" ] && echo "$set_host" || echo "$set_in")) срещу $EVAL_DB…"
  docker build -q --target build -t "$EVAL_IMAGE" "$APP" >/dev/null || {
    warn "образът за оценката (стадий build) не се построи"
    return 1
  }
  ensure_eval_db || {
    warn "тестовата база $EVAL_DB не се създаде в Postgres на staging"
    return 1
  }
  net="$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT" \
    --filter label=com.docker.compose.network=backend)" || net=""
  [ -n "$net" ] && [ "$(printf '%s\n' "$net" | wc -l)" = 1 ] || {
    warn "няма (точно една) вътрешна мрежа backend на $PROJECT"
    return 1
  }
  out="$SHARED/eval-runs/$TS"
  # run_eval се вика от условие (`elif ! run_eval`) — там set -e не важи, затова всяка стъпка е изрична.
  install -d -m 700 "$SHARED/eval-runs" && install -d -m 700 -o 1000 -g 1000 "$out" && install -d -m 750 "$LOG_DIR" || {
    warn "папките за отчета не се създадоха"
    return 1
  }
  pw="$(env_get "$ENV_FILE" POSTGRES_PASSWORD)"
  local args=(create --network "$net" --read-only --tmpfs "/tmp:size=256m,mode=1777"
    --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 256 --memory 1g --cpus 1
    --user 1000:1000 --label "com.carbonstealth.role=chatchat-staging-eval"
    -e DATABASE_URL -e HOME=/tmp -e CHECKPOINT_DISABLE=1 -e PRISMA_HIDE_UPDATE_MESSAGE=1
    -e EVAL_SET="$set_in" -e EVAL_FLAG="$flag" -v "$out:/reports")
  [ -z "$set_host" ] || args+=(-v "$set_host:/eval/set.json:ro")
  if [ "$mode" = real ]; then
    # Само зададените (празен низ би минал за „модел ''“); не са тайни — проект, регион, имена на модели.
    for f in VERTEX_PROJECT_ID VERTEX_REGION EMBEDDING_MODEL AI_MODEL; do
      [ -z "$(env_get "$ENV_FILE" "$f")" ] || args+=(-e "$f=$(env_get "$ENV_FILE" "$f")")
    done
    sa="$(env_get "$ENV_FILE" GCP_SA_FILE)"
    if [ -n "$sa" ]; then args+=(-v "$sa:/run/secrets/gcp-sa.json:ro" -e GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcp-sa.json); fi
  fi
  # Паролата — само в средата на docker клиента (не в argv, не в лога).
  cid="$(DATABASE_URL="postgresql://chatchat:$pw@db:5432/$EVAL_DB" docker "${args[@]}" "$EVAL_IMAGE" sh -c \
    './node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma && exec ./node_modules/.bin/tsx evals/run.ts --set "$EVAL_SET" --out /reports $EVAL_FLAG')" || {
    warn "контейнерът за оценката не се създаде"
    return 1
  }
  if [ "$mode" = real ]; then
    defnet="$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT" \
      --filter label=com.docker.compose.network=default | head -n 1)" || defnet=""
    [ -n "$defnet" ] && docker network connect "$defnet" "$cid" >/dev/null || {
      docker rm -f "$cid" >/dev/null 2>&1 || true
      warn "оценката с Vertex иска мрежата с изход навън на $PROJECT — няма я"
      return 1
    }
  fi
  timeout "$EVAL_TIMEOUT" docker start -a "$cid" 2>&1 | tee -a "$LOG_DIR/staging-eval.log" || true
  rc="$(docker inspect -f '{{.State.ExitCode}}' "$cid" 2>/dev/null | tr -dc '0-9')" || rc=""
  if [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" = true ]; then
    warn "оценката не завърши за $EVAL_TIMEOUT s — спрях я"
    rc=124
  fi
  docker rm -f "$cid" >/dev/null 2>&1 || true
  install -d -m 755 "$SHARED/eval-reports"
  for f in "$out"/*.json; do
    [ -f "$f" ] || continue
    install -m 644 "$f" "$SHARED/eval-reports/" && copied=1
  done
  if [ "$copied" = 1 ]; then
    ok "отчетът е в $SHARED/eval-reports (KPI таблото на staging) и $out"
  else
    warn "оценката не остави отчет ($out)"
  fi
  prune_reports || true
  [ "${rc:-1}" = 0 ]
}

main() {
  local rc=0
  [ "$(id -u)" = 0 ] || fail 1 "пусни като root (sudo)."
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    fail 1 "липсва Docker с compose plugin."
  fi
  [ -f "$SRC_APP/deploy/deploy.sh" ] || fail 1 "няма $SRC_APP/deploy/deploy.sh."
  [ -f "$SRC_APP/deploy/nginx/$DOMAIN.conf" ] || fail 1 "няма vhost-а на staging ($SRC_APP/deploy/nginx/$DOMAIN.conf)."
  install -d -m 700 "$SHARED"
  bootstrap_env
  check_guards
  ensure_access
  prepare_copy
  # Опитът (за autodeploy: логовете при провал на миграция; за човек: какво е вдигнато сега).
  printf '%s\n' "$APP" >"$SHARED/last-attempt.tmp" && mv -f "$SHARED/last-attempt.tmp" "$SHARED/last-attempt"
  log "разгръщам $APP като compose проект $PROJECT…"
  # Всичко, което deploy.sh чете от средата, е изрично — нищо наследено от продукцията.
  env CHATCHAT_STAGING=1 COMPOSE_PROJECT_NAME="$PROJECT" CHATCHAT_SHARED="$SHARED" \
    CHATCHAT_DOMAIN="$DOMAIN" CHATCHAT_NGINX_SITE="$NGINX_SITE" CHATCHAT_NGINX_LINK="$NGINX_LINK" \
    CHATCHAT_LAST_GOOD="$SHARED/.last-live" CHATCHAT_PGVECTOR_MARK="$SHARED/.db-pgvector" \
    CHATCHAT_PGDATA_CONF_DIR=/nonexistent/chatchat-staging \
    bash "$APP/deploy/deploy.sh" || rc=$?
  [ "$rc" = 0 ] || exit "$rc"
  cd "$APP"
  export COMPOSE_PROJECT_NAME="$PROJECT"
  if [ "$SKIP_EVAL" = 1 ]; then
    log "STAGING_SKIP_EVAL=1 (откат) — кодът на last-good вече е минал оценката"
  elif ! run_eval; then
    warn "ОЦЕНКАТА Е ЧЕРВЕНА — деплоят на staging е неуспешен (изход 5). Остава вдигнат за преглед;"
    warn "  last-good не е преместен; продукцията не е пипана. Отчет: $SHARED/eval-runs/$TS (виж и $LOG_DIR/staging-eval.log)."
    exit 5
  fi
  printf '%s\n' "$APP" >"$SHARED/last-good.tmp" && mv -f "$SHARED/last-good.tmp" "$SHARED/last-good"
  prune_copies || true
  ok "staging е жив ($APP) — https://$DOMAIN (само с парола/allowlist)"
}

# Изпълнен — разгръща; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
