#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fakturist/deploy/deploy.sh — разгръща Фактурист от тази папка на release-а (Docker Compose).
#
#   sudo bash /opt/few-few/current/fakturist/deploy/deploy.sh    # ръчно
#   deploy/autodeploy.sh го вика за всеки release с fakturist/   # автоматично — същият път
#
# Моделът на rilievi/deploy/deploy.sh. Ред: тайните от стабилния път → проверка на тайните и на
# отпечатъка на LEDGER_SEAL_KEY → build → бекъп на базата преди миграция (след build-а: дъмпът е
# отпреди самата смяна) → up (entrypoint-ът прилага `prisma migrate deploy`) → чака, докато на порта
# отговори именно Фактурист → vhost-ът от репото, щом има сертификат → подсказки.
#
# Тайни не се измислят: .env прави веднъж deploy/setup-env.sh. Изход: 0 — жив; 3 — няма .env (машината
# не е настроена); 4 — контейнерите са сменени, но Фактурист не отговаря (autodeploy връща предишния
# код); 1 — спрян преди смяната (работещите не са пипани). След успешната сонда нищо не сменя изхода 0.
#
# FAKTURIST_SKIP_BACKUP=1 — без нов дъмп (откатът на autodeploy): иначе всеки провал гори слот от
# ротацията и изтласква дъмпа отпреди счупената миграция.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="${FAKTURIST_SHARED:-/opt/few-few/shared/fakturist}"
DOMAIN="${FAKTURIST_DOMAIN:-fakturist.carbonstealth.eu}"
NGINX_SITE="${FAKTURIST_NGINX_SITE:-/etc/nginx/sites-available/fakturist}"
NGINX_LINK="${FAKTURIST_NGINX_LINK:-/etc/nginx/sites-enabled/fakturist}"
LE_DIR="${FAKTURIST_LE_DIR:-/etc/letsencrypt}"
HEALTH_WAIT="${FAKTURIST_HEALTH_WAIT:-90}"
MIGRATION_WAIT="${FAKTURIST_MIGRATION_WAIT:-1800}"
KEEP_BACKUPS="${FAKTURIST_KEEP_BACKUPS:-5}"
# Най-голямата възраст на копие в дни (договорът за обработване, т. 11 — 90 дни).
BACKUP_MAX_DAYS="${FAKTURIST_BACKUP_MAX_DAYS:-90}"
SKIP_BACKUP="${FAKTURIST_SKIP_BACKUP:-0}"
LAST_GOOD="${FAKTURIST_LAST_GOOD:-$SHARED/last-good}"
# Отпечатъкът (SHA-256) на LEDGER_SEAL_KEY от първия успешен деплой. Самият ключ не е тук.
SEAL_PRINT="${FAKTURIST_SEAL_PRINT:-$SHARED/ledger-seal-key.sha256}"
# Портът вътре в контейнера (docker-compose.yml: PORT: '4340'); на хоста — HTTP_PORT от .env.
APP_PORT=4340
TS="$(date +%Y%m%d-%H%M%S)"

log()  { printf '\033[1;36m▸ fakturist: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ fakturist: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ fakturist: %s\033[0m\n' "$*" >&2; }
fail() {
  local code="$1"
  shift
  printf '\033[31m✘ fakturist: %s\033[0m\n' "$*" >&2
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

# POSTGRES_PASSWORD влиза некодирана в DATABASE_URL: „/“, „?“, „#“, „%“ и „@“ чупят адреса и
# приложението никога не стига до базата. Ключовете — както ги иска src/config.ts (64 hex знака).
# По-добре отказ сега, отколкото сонда и откат.
check_secrets() {
  local jwt seal
  case "$(env_value POSTGRES_PASSWORD)" in
    '') fail 1 "POSTGRES_PASSWORD е празна — sudoedit $SHARED/.env" ;;
    *[/?#%@]*) fail 1 "POSTGRES_PASSWORD съдържа / ? # % или @ — те чупят DATABASE_URL. Нова (само преди първия деплой): openssl rand -hex 32." ;;
  esac
  jwt="$(env_value JWT_SECRET)"
  seal="$(env_value LEDGER_SEAL_KEY)"
  printf '%s' "$jwt" | grep -Eqx '[0-9a-fA-F]{64}' ||
    fail 1 "JWT_SECRET трябва да е 64 hex знака (openssl rand -hex 32)."
  printf '%s' "$seal" | grep -Eqx '[0-9a-fA-F]{64}' ||
    fail 1 "LEDGER_SEAL_KEY трябва да е 64 hex знака. Ако липсва след първата фактура — върни го от бекъпа на тайните, НЕ генерирай нов."
  [ "$jwt" != "$seal" ] ||
    fail 1 "JWT_SECRET и LEDGER_SEAL_KEY са еднакви — сесиите и печатът искат отделни ключове (src/config.ts)."
  case "$(env_value PUBLIC_BASE_URL)" in
    https://*) ;;
    *) fail 1 "PUBLIC_BASE_URL трябва да е https://… (тук: https://$DOMAIN)." ;;
  esac
}

# LEDGER_SEAL_KEY не се сменя НИКОГА след първата фактура: с него се проверява веригата на документите
# и се пазят 2FA тайните. Първият успешен деплой записва отпечатъка му (SHA-256 — ключът не излиза);
# след това друг ключ в .env спира деплоя ПРЕДИ build-а — работещите контейнери не са пипани.
seal_print() { printf '%s' "$(env_value LEDGER_SEAL_KEY)" | sha256sum | cut -d' ' -f1; }

guard_seal_key() {
  [ -f "$SEAL_PRINT" ] || return 0
  [ "$(seal_print)" = "$(head -n 1 "$SEAL_PRINT")" ] && return 0
  fail 1 "LEDGER_SEAL_KEY в $SHARED/.env не е ключът от първия деплой — веригата на документите и 2FA тайните няма да се проверят. Върни стария от бекъпа на тайните. (Само ако още НЯМА издадена фактура и смяната е нарочна: изтрий $SEAL_PRINT.)"
}

remember_seal_key() {
  [ -f "$SEAL_PRINT" ] && return 0
  seal_print >"$SEAL_PRINT.tmp" && chmod 600 "$SEAL_PRINT.tmp" && mv -f "$SEAL_PRINT.tmp" "$SEAL_PRINT" &&
    ok "записах отпечатъка на LEDGER_SEAL_KEY ($SEAL_PRINT) — друг ключ занапред спира деплоя"
}

# Има ли база за бекъп — решава се преди build-а: при пръв деплой томът още не съществува.
BACKUP_PLAN=""
plan_backup() {
  if [ "$SKIP_BACKUP" = "1" ]; then
    BACKUP_PLAN=skip
  elif docker volume inspect fakturist_db-data >/dev/null 2>&1; then
    BACKUP_PLAN=dump
  else
    BACKUP_PLAN=first
  fi
}

# Бекъп ПРЕДИ миграцията. Без бекъп няма миграция: провалът тук спира деплоя, преди контейнерът на
# приложението да е сменен. Дъмпът е с --clean --if-exists: възстановява се в съществуващата база.
backup_db() {
  case "$BACKUP_PLAN" in
    skip) log "FAKTURIST_SKIP_BACKUP=1 (откат) — без нов бекъп"; return 0 ;;
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
  if docker compose exec -T db pg_dump --clean --if-exists -U fakturist -d fakturist | gzip >"$file.partial"; then
    mv -f "$file.partial" "$file"
    ok "бекъп преди миграция → $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    fail 1 "бекъпът преди миграция се провали — не мигрирам без бекъп."
  fi
  find "$dir" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' | sort -rn |
    tail -n "+$((KEEP_BACKUPS + 1))" | cut -d' ' -f2- | xargs -r rm -f
  # Договорът за обработване обещава най-много 90 дни (т. 11) — и по възраст, не само по брой.
  # -mtime +N трие от навършени N+1 дни, а cron минава веднъж на ден: N = таванът − 2 дава буквално ≤ 90.
  find "$dir" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -mtime "+$((BACKUP_MAX_DAYS - 2))" -delete
}

# Копията се трият по възраст и между деплоите: дневна задача на cron (идемпотентно — презаписва се).
# Една задача за двата вида копия — преди деплой и дневните (deploy/backup.sh): таванът важи и в дните,
# в които дневният бекъп не минава (тогава той не стига до собственото си чистене).
CRON_DAILY="${FAKTURIST_CRON_DAILY:-/etc/cron.daily}"
install_backup_prune() {
  local job="$CRON_DAILY/fakturist-backups"
  [ -d "$CRON_DAILY" ] || return 1
  printf '#!/bin/sh\n# Фактурист: резервните копия (преди деплой и дневните) — най-много %s дни (договор за обработване, т. 11).\nfind %s -maxdepth 1 -name '"'"'pre-deploy-*.sql.gz'"'"' -mtime +%s -delete 2>/dev/null || true\nfind %s -maxdepth 1 -name '"'"'fakturist-*.sql.gz'"'"' -mtime +%s -delete 2>/dev/null || true\n' \
    "$BACKUP_MAX_DAYS" "$SHARED/backups" "$((BACKUP_MAX_DAYS - 2))" "$SHARED/backups/daily" "$((BACKUP_MAX_DAYS - 2))" >"$job.tmp"
  chmod 755 "$job.tmp"
  mv -f "$job.tmp" "$job"
}

# Дневният бекъп: таймер на systemd (03:40 UTC) пуска deploy/backup.sh от последния работещ release.
# Идемпотентно: файловете се презаписват от release-а, enable --now на включен таймер не прави нищо.
SYSTEMD_DIR="${FAKTURIST_SYSTEMD_DIR:-/etc/systemd/system}"
install_backup_timer() {
  local unit
  command -v systemctl >/dev/null 2>&1 || { warn "няма systemd — дневният бекъп не е сложен"; return 0; }
  for unit in fakturist-backup.service fakturist-backup-alert.service fakturist-backup.timer; do
    install -m 644 "$APP_DIR/deploy/systemd/$unit" "$SYSTEMD_DIR/$unit" || return 1
  done
  systemctl daemon-reload && systemctl enable --now fakturist-backup.timer >/dev/null 2>&1 || return 1
  ok "дневният бекъп е включен (fakturist-backup.timer: 14 копия до 90 дни, проверено възстановяване)"
}

# Миграция, която още тече (entrypoint-ът на app я прилага): ред в _prisma_migrations без край, без
# отказ и без грешка. Провалената има `logs` — по нея не се чака.
migration_running() {
  local n
  n="$(docker compose exec -T db psql -U fakturist -d fakturist -tAc \
    'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NULL' \
    2>/dev/null | tr -dc '0-9')" || n=""
  [ -n "$n" ] && [ "$n" -gt 0 ]
}

# Код 200 сам не казва КОЙ отговаря на порта: /health на Фактурист носи маркера "app":"fakturist"
# (src/routes/health.ts), а отделно самоличността се проверява и от страната на Docker — портът на хоста
# трябва да е публикуван точно от контейнера app на ТОЗИ проект. Докато миграция още
# тече, се чака и след HEALTH_WAIT (до MIGRATION_WAIT): откат посред миграция би тръгнал върху
# полуприложена схема.
port_is_ours() {
  local published
  published="$(docker compose port app "$APP_PORT" 2>/dev/null | tail -n 1)" || published=""
  [ "$published" = "127.0.0.1:$1" ]
}

wait_healthy() {
  local url="http://127.0.0.1:$1/health" body deadline=$((SECONDS + HEALTH_WAIT))
  local hard=$((SECONDS + MIGRATION_WAIT))
  while :; do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null)" || body=""
    case "$body" in *'"ok":true'*'"app":"fakturist"'*)
      port_is_ours "$1" && return 0
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

# Последният release, който е отговорил — целта на отката. Истинският път, без symlink-а current.
remember_live() {
  local real
  real="$(cd "$APP_DIR" && pwd -P)" && install -d -m 700 "$(dirname "$LAST_GOOD")" &&
    printf '%s\n' "$real" >"$LAST_GOOD.tmp" && mv -f "$LAST_GOOD.tmp" "$LAST_GOOD"
}

# Vhost-ът е файл в репото: щом има сертификат, сървърът носи точно него, с порта от HTTP_PORT
# (nginx -t, после reload; при грешка се връща старият). Сертификатът се взема веднъж на ръка.
sync_nginx() {
  local port="$1" conf="$APP_DIR/deploy/nginx/fakturist.conf" bak="$NGINX_SITE.bak-$TS" new why=""
  if ! command -v nginx >/dev/null 2>&1; then
    warn "няма nginx на хоста — Фактурист отговаря само на 127.0.0.1:$port"
    return 0
  fi
  if [ ! -f "$LE_DIR/live/$DOMAIN/fullchain.pem" ]; then
    warn "няма TLS сертификат за $DOMAIN — Фактурист още не е публичен. Веднъж, когато DNS сочи насам:"
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

# Мастър акаунтът не се създава сам (паролата не минава през скрипт): казваме командата.
hints() {
  local masters
  masters="$(docker compose exec -T db psql -U fakturist -d fakturist -tAc \
    "SELECT count(*) FROM \"User\" WHERE \"platformRole\" = 'MASTER'" 2>/dev/null | tr -dc '0-9')" || masters=""
  if [ "$masters" = "0" ]; then
    warn "няма мастър акаунт — създай го веднъж:"
    warn "  sudo bash $APP_DIR/deploy/create-owner.sh"
  fi
  [ "$(env_value REGISTRATION_OPEN)" = "true" ] ||
    warn "регистрацията е затворена (REGISTRATION_OPEN не е true в $SHARED/.env) — отвори я там и пусни деплоя пак."
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
  guard_seal_key
  port="$(env_value HTTP_PORT | tr -dc '0-9')"
  port="${port:-4340}"
  plan_backup
  log "build…"
  docker compose build app || fail 1 "build се провали — работещите контейнери не са пипани."
  backup_db
  log "up (entrypoint-ът прилага миграциите)…"
  docker compose up -d --remove-orphans db app || fail 4 "docker compose up се провали (зает порт 127.0.0.1:$port? — ss -tlnp)."
  wait_healthy "$port" ||
    fail 4 "на 127.0.0.1:$port не отговаря Фактурист след ${HEALTH_WAIT} s. Виж: cd $APP_DIR && docker compose logs --tail=80 app"
  ok "жив на 127.0.0.1:$port"
  # Новият код вече работи: оттук нататък нищо не сменя изхода 0.
  remember_live || warn "не записах $LAST_GOOD — откатът сочи предишния release"
  remember_seal_key || warn "не записах отпечатъка на LEDGER_SEAL_KEY — следващият деплой опитва пак"
  sync_nginx "$port" || warn "nginx не е обновен — Фактурист е жив на 127.0.0.1:$port"
  install_backup_prune || warn "няма /etc/cron.daily — копията се трият по възраст само при деплой и бекъп"
  install_backup_timer || warn "дневният бекъп не е сложен — deploy/README.md (fakturist)"
  hints || true
}

# Изпълнен — разгръща; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
