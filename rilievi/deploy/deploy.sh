#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/deploy.sh — разгръща Rilievi Impianti от тази папка на release-а (Docker Compose).
#
#   sudo bash /opt/few-few/current/rilievi/deploy/deploy.sh    # ръчно (DEPLOY.md)
#   deploy/autodeploy.sh го вика за всеки release с rilievi/   # автоматично — същият път
#
# Ред: тайните от стабилния път → build (приложението и фоновият процес на снимките) → бекъп на
# базата преди миграция (след build-а: дъмпът е отпреди самата смяна) → up (entrypoint-ът прилага
# `prisma migrate deploy`) → чака, докато на порта отговори именно Rilievi → фоновият процес върви →
# дневният бекъп → vhost-ът от репото, щом има сертификат → подсказки.
#
# Тайни не се измислят — освен ключа на печата на листовете за интервенция (ensure_seal_key): нов, без
# предишно състояние, създава се веднъж и после само се чете. Изход: 0 — жив; 3 — няма .env (машината не е настроена); 4 — контейнерите са
# сменени, но Rilievi не отговаря (autodeploy връща предишния код); 1 — спрян преди смяната
# (работещите не са пипани). След успешната сонда нищо не сменя изхода 0.
#
# RILIEVI_SKIP_BACKUP=1 — без нов дъмп (откатът на autodeploy): иначе всеки провал гори слот от
# ротацията и изтласква дъмпа отпреди счупената миграция.
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
KEEP_BACKUPS="${RILIEVI_KEEP_BACKUPS:-5}"
SKIP_BACKUP="${RILIEVI_SKIP_BACKUP:-0}"
LAST_GOOD="${RILIEVI_LAST_GOOD:-$SHARED/last-good}"
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

# Ключът на печата на потвърдените листове за интервенция (src/interventi/sigillo.ts): липсва ли в
# $SHARED/.env (машина отпреди листовете), се създава веднъж там. Никога не се сменя — сменен или загубен
# ключ значи, че нито един потвърден лист не минава проверката (PDF и имейл спират) — DEPLOY.md, т. 1.
ensure_seal_key() {
  [ -z "$(env_value INTERVENTI_SEAL_KEY)" ] || return 0
  command -v openssl >/dev/null 2>&1 || fail 1 "липсва openssl — не мога да създам INTERVENTI_SEAL_KEY."
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

# Код 200 сам не казва КОЙ отговаря на порта: чака се маркерът на Rilievi и база, която отговаря.
wait_healthy() {
  local url="http://127.0.0.1:$1/health" body deadline=$((SECONDS + HEALTH_WAIT))
  while :; do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null)" || body=""
    case "$body" in *'"app":"rilievi"'*)
      case "$body" in *'"status":"ok"'*) return 0 ;; esac
      ;;
    esac
    [ "$SECONDS" -lt "$deadline" ] || return 1
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

# Дневният бекъп: таймер на systemd (03:10 UTC) пуска deploy/backup.sh от последния работещ release.
install_backup_timer() {
  command -v systemctl >/dev/null 2>&1 || { warn "няма systemd — дневният бекъп не е сложен"; return 0; }
  install -m 644 "$APP_DIR/deploy/systemd/rilievi-backup.service" /etc/systemd/system/rilievi-backup.service &&
    install -m 644 "$APP_DIR/deploy/systemd/rilievi-backup.timer" /etc/systemd/system/rilievi-backup.timer &&
    systemctl daemon-reload &&
    systemctl enable --now rilievi-backup.timer >/dev/null 2>&1 &&
    ok "дневният бекъп е включен (rilievi-backup.timer, 14 дни)"
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

# Първият MASTER не се създава сам (паролата не минава през скрипт): казваме командата.
hints() {
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
  sync_env
  ensure_seal_key
  check_secrets
  port="$(env_value HTTP_PORT | tr -dc '0-9')"
  port="${port:-4330}"
  plan_backup
  log "build…"
  docker compose build app worker || fail 1 "build се провали — работещите контейнери не са пипани."
  backup_db
  log "up (entrypoint-ът прилага миграциите)…"
  docker compose up -d --remove-orphans || fail 4 "docker compose up се провали."
  wait_healthy "$port" ||
    fail 4 "на 127.0.0.1:$port не отговаря Rilievi след ${HEALTH_WAIT} s. Виж: cd $APP_DIR && docker compose logs --tail=80 app"
  ok "жив на 127.0.0.1:$port"
  # Новият код вече работи: оттук нататък нищо не сменя изхода 0.
  remember_live || warn "не записах $LAST_GOOD — откатът сочи предишния release"
  check_worker || warn "фоновият процес на снимките не върви — каченото чака в опашката. Виж: cd $APP_DIR && docker compose logs --tail=80 worker"
  install_backup_timer || warn "дневният бекъп не е сложен — DEPLOY.md, т. 6"
  sync_nginx "$port" || warn "nginx не е обновен — Rilievi е жив на 127.0.0.1:$port"
  hints || true
}

# Изпълнен — разгръща; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
