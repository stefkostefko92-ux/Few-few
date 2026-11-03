#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# semki/deploy/deploy.sh — разгръща Semki Bot от тази папка на release-а (Docker Compose).
#
#   sudo bash /opt/few-few/current/semki/deploy/deploy.sh    # ръчно (DEPLOY.md)
#   deploy/autodeploy.sh го вика за всеки release със semki/ # автоматично — същият път
#
# Ред: тайните от стабилния път → проверка → build → бекъп на базата преди миграция → up
# (entrypoint-ът прилага `prisma migrate deploy`) → чака, докато на порта отговори именно Semki →
# vhost-ът от репото, щом има сертификат.
#
# Тайни не се измислят. Изход: 0 — жив; 3 — няма .env (машината не е настроена); 4 — контейнерите са
# сменени, но Semki не отговаря (autodeploy връща предишния код); 1 — спрян преди смяната
# (работещите не са пипани). След успешната сонда нищо не сменя изхода 0.
#
# SEMKI_SKIP_BACKUP=1 — без нов дъмп (откатът на autodeploy): иначе всеки провал гори слот от
# ротацията и изтласква дъмпа отпреди счупената миграция.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="${SEMKI_SHARED:-/opt/few-few/shared/semki}"
DOMAIN="${SEMKI_DOMAIN:-vps2.carbonstealth.eu}"
NGINX_SITE="${SEMKI_NGINX_SITE:-/etc/nginx/sites-available/semki}"
NGINX_LINK="${SEMKI_NGINX_LINK:-/etc/nginx/sites-enabled/semki}"
LE_DIR="${SEMKI_LE_DIR:-/etc/letsencrypt}"
HEALTH_WAIT="${SEMKI_HEALTH_WAIT:-90}"
KEEP_BACKUPS="${SEMKI_KEEP_BACKUPS:-5}"
SKIP_BACKUP="${SEMKI_SKIP_BACKUP:-0}"
LAST_GOOD="${SEMKI_LAST_GOOD:-$SHARED/last-good}"
TS="$(date +%Y%m%d-%H%M%S)"

log()  { printf '\033[1;36m▸ semki: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ semki: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ semki: %s\033[0m\n' "$*" >&2; }
fail() {
  local code="$1"
  shift
  printf '\033[31m✘ semki: %s\033[0m\n' "$*" >&2
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

# POSTGRES_PASSWORD влиза некодирана в DATABASE_URL: „/“, „?“, „#“, „%“ и „@“ чупят адреса.
# Discord ID-тата са snowflake (17–20 цифри) — иначе ботът тръгва и мълчи.
check_secrets() {
  case "$(env_value POSTGRES_PASSWORD)" in
    '') fail 1 "POSTGRES_PASSWORD е празна — DEPLOY.md, т. 2." ;;
    *[/?#%@]*) fail 1 "POSTGRES_PASSWORD съдържа / ? # % или @ — те чупят DATABASE_URL. Нова: openssl rand -hex 32." ;;
  esac
  printf '%s' "$(env_value SESSION_SECRET)" | grep -Eqx '[0-9a-fA-F]{64}' ||
    fail 1 "SESSION_SECRET трябва да е 64 hex знака (openssl rand -hex 32) — DEPLOY.md, т. 2."
  [ -n "$(env_value DISCORD_TOKEN)" ] || fail 1 "DISCORD_TOKEN е празен — DEPLOY.md, т. 1."
  [ -n "$(env_value DISCORD_CLIENT_SECRET)" ] || fail 1 "DISCORD_CLIENT_SECRET е празен — DEPLOY.md, т. 1."
  local k
  for k in DISCORD_CLIENT_ID DISCORD_GUILD_ID; do
    printf '%s' "$(env_value "$k")" | grep -Eqx '[0-9]{17,20}' || fail 1 "$k не е Discord ID (17–20 цифри) — DEPLOY.md, т. 1."
  done
  case "$(env_value PUBLIC_BASE_URL)" in
    https://*) ;;
    *) fail 1 "PUBLIC_BASE_URL трябва да е https://… — DEPLOY.md, т. 2." ;;
  esac
}

# Има ли база за бекъп — решава се преди build-а: при пръв деплой томът още не съществува.
BACKUP_PLAN=""
plan_backup() {
  if [ "$SKIP_BACKUP" = "1" ]; then
    BACKUP_PLAN=skip
  elif docker volume inspect semki_db-data >/dev/null 2>&1; then
    BACKUP_PLAN=dump
  else
    BACKUP_PLAN=first
  fi
}

# Бекъп ПРЕДИ миграцията. Без бекъп няма миграция: провалът тук спира деплоя, преди контейнерът на
# приложението да е сменен. Дъмпът е с --clean --if-exists: възстановява се в съществуващата база.
backup_db() {
  case "$BACKUP_PLAN" in
    skip) log "SEMKI_SKIP_BACKUP=1 (откат) — без нов бекъп"; return 0 ;;
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
  if docker compose exec -T db pg_dump --clean --if-exists -U semki -d semki | gzip >"$file.partial"; then
    mv -f "$file.partial" "$file"
    ok "бекъп преди миграция → $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    fail 1 "бекъпът преди миграция се провали — не мигрирам без бекъп."
  fi
  find "$dir" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' | sort -rn |
    tail -n "+$((KEEP_BACKUPS + 1))" | cut -d' ' -f2- | xargs -r rm -f
}

# Код 200 сам не казва КОЙ отговаря на порта: чака се маркерът на Semki и база, която отговаря.
wait_healthy() {
  local url="http://127.0.0.1:$1/health" body deadline=$((SECONDS + HEALTH_WAIT))
  while :; do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null)" || body=""
    case "$body" in *'"app":"semki"'*)
      case "$body" in *'"status":"ok"'*) return 0 ;; esac
      ;;
    esac
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

# Vhost-ът е файл в репото: щом има сертификат, сървърът носи точно него, с порта от HTTP_PORT
# (nginx -t, после reload; при грешка се връща старият). Сертификатът се взема веднъж на ръка.
sync_nginx() {
  local port="$1" conf="$APP_DIR/deploy/nginx/$DOMAIN.conf" bak="$NGINX_SITE.bak-$TS" new why=""
  if ! command -v nginx >/dev/null 2>&1; then
    warn "няма nginx на хоста — Semki отговаря само на 127.0.0.1:$port"
    return 0
  fi
  if [ ! -f "$LE_DIR/live/$DOMAIN/fullchain.pem" ]; then
    warn "няма TLS сертификат за $DOMAIN — дашбордът още не е публичен. Веднъж, когато DNS сочи насам:"
    warn "  certbot certonly --nginx -d $DOMAIN --deploy-hook 'systemctl reload nginx' && bash $APP_DIR/deploy/deploy.sh"
    return 0
  fi
  [ -f "$conf" ] || { warn "няма $conf в release-а — nginx не е пипан"; return 0; }
  new="$(mktemp)" || return 1
  sed "s/127\.0\.0\.1:4340;/127.0.0.1:$port;/g" "$conf" >"$new"
  if ! grep -q "127.0.0.1:$port;" "$new"; then
    rm -f "$new"
    warn "vhost-ът в репото не сочи 127.0.0.1:4340 — nginx не е пипан"
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

main() {
  local port
  [ "$(id -u)" = "0" ] || fail 1 "пусни като root (sudo)."
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    fail 1 "липсва Docker с compose plugin."
  fi
  cd "$APP_DIR"
  sync_env
  check_secrets
  port="$(env_value HTTP_PORT | tr -dc '0-9')"
  port="${port:-4340}"
  plan_backup
  log "build…"
  docker compose build app || fail 1 "build се провали — работещите контейнери не са пипани."
  backup_db
  log "up (entrypoint-ът прилага миграциите)…"
  docker compose up -d --remove-orphans || fail 4 "docker compose up се провали."
  wait_healthy "$port" ||
    fail 4 "на 127.0.0.1:$port не отговаря Semki след ${HEALTH_WAIT} s. Виж: cd $APP_DIR && docker compose logs --tail=80 app"
  ok "жив на 127.0.0.1:$port"
  # Новият код вече работи: оттук нататък нищо не сменя изхода 0.
  remember_live || warn "не записах $LAST_GOOD — откатът сочи предишния release"
  sync_nginx "$port" || warn "nginx не е обновен — Semki е жив на 127.0.0.1:$port"
  if ! curl -fsS --max-time 5 "http://127.0.0.1:$port/health" 2>/dev/null | grep -q '"discord":"ready"'; then
    warn "ботът още не е свързан с Discord — виж: cd $APP_DIR && docker compose logs --tail=80 app"
  fi
}

# Изпълнен — разгръща; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
