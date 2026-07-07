#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# autodeploy.sh — автоматизиран деплой на монорепото от РЪЧНО качен GitHub архив.
#
# Работен поток (по желание на собственика):
#   1) Сваляш архива от GitHub (Code → Download ZIP) и го качваш РЪЧНО в /root.
#   2) Пускаш този скрипт. Оттук всичко е автоматично — от разархивирането до
#      жив сървър: разопаковане → билд → миграции → (сийд само 1-ви път) →
#      health check → презареждане на прокси/TLS.
#
# Употреба:
#   sudo bash /root/few-few-*/deploy/autodeploy.sh            # деплой на новия архив
#   sudo ARCHIVE=/root/Few-few.zip bash .../autodeploy.sh     # конкретен архив
#   sudo FORCE_SEED=1 bash .../autodeploy.sh                  # принудителен сийд (zbd)
#   sudo PROJECTS="medqr" bash .../autodeploy.sh              # само един проект
#
# Идемпотентен: безопасно е да се пуска многократно. Пази предишните releases за
# връщане назад и прави бекъп преди миграция. НЕ съхранява тайни в репото.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ╔═ КОНФИГУРАЦИЯ ═══════════════════════════════════════════════════════════════
# Кои проекти да се разгръщат на ТОЗИ сървър (махни който не върви тук).
PROJECTS="${PROJECTS:-zabobovdol medqr nexus SupremeDiscordBot vizitka}"
ARCHIVE_DIR="${ARCHIVE_DIR:-/root}"           # където качваш архива ръчно
RELEASES_DIR="${RELEASES_DIR:-/opt/few-few/releases}"
CURRENT_LINK="${CURRENT_LINK:-/opt/few-few/current}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

# medqr (systemd модел)
MEDQR_DIR="${MEDQR_DIR:-/opt/medqr}"
MEDQR_SERVICE="${MEDQR_SERVICE:-medqr}"
MEDQR_HEALTH_URL="${MEDQR_HEALTH_URL:-http://127.0.0.1:3000/}"

# vizitka (systemd модел, като medqr)
VIZITKA_DIR="${VIZITKA_DIR:-/opt/vizitka}"
VIZITKA_SERVICE="${VIZITKA_SERVICE:-vizitka}"
VIZITKA_HEALTH_URL="${VIZITKA_HEALTH_URL:-http://127.0.0.1:3100/}"

# Nexus Dominion — Docker Compose; expose the server on 127.0.0.1:4000
# behind nginx/Caddy. State (server/data + server/.env) lives outside
# the release dir and is carried over on every redeploy.
NEXUS_DIR="${NEXUS_DIR:-/opt/nexus}"
NEXUS_STATE_DIR="${NEXUS_STATE_DIR:-/opt/nexus/state}"
NEXUS_HEALTH_URL="${NEXUS_HEALTH_URL:-http://127.0.0.1:4000/api/health}"

# zabobovdol (Docker Compose модел) — портът се авто-засича от неговия .env (HTTP_PORT),
# освен ако ZBD_HEALTH_URL не е зададен изрично.
ZBD_HEALTH_URL_SET="${ZBD_HEALTH_URL:+1}"
ZBD_HEALTH_URL="${ZBD_HEALTH_URL:-http://127.0.0.1:80/}"
FORCE_SEED="${FORCE_SEED:-0}"

# supreme (Supreme Bot — Docker Compose модел) — frontend nginx е единственият
# публикуван порт (127.0.0.1:8080), останалите services са вътрешни. backend
# контейнерът пуска `prisma migrate deploy` сам в entrypoint-а. Тайните живеят
# на сървъра в SupremeDiscordBot/.env (корен, postgres), SupremeDiscordBot/backend/.env, SupremeDiscordBot/bot/.env
# и SupremeDiscordBot/frontend/.env (build-time VITE_*); пренасят се при всеки деплой.
SUPREME_HEALTH_URL="${SUPREME_HEALTH_URL:-http://127.0.0.1:8080/}"
# ╚══════════════════════════════════════════════════════════════════════════════

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Пусни като root (sudo)."
TS="$(date +%Y%m%d-%H%M%S)"

# ── 1) Намери архива ──────────────────────────────────────────────────────────
find_archive() {
  if [ -n "${ARCHIVE:-}" ]; then echo "$ARCHIVE"; return; fi
  # най-новият .zip/.tar.gz в ARCHIVE_DIR
  local a
  a="$(ls -t "$ARCHIVE_DIR"/*.zip "$ARCHIVE_DIR"/*.tar.gz 2>/dev/null | head -1 || true)"
  [ -n "$a" ] || die "Няма архив в $ARCHIVE_DIR (качи .zip или .tar.gz)."
  echo "$a"
}
ARCHIVE_PATH="$(find_archive)"
log "Архив: $ARCHIVE_PATH"

# ── 1б) Проверка на целостта (по избор) ───────────────────────────────────────
# Ако до архива има <архив>.sha256, верифицирай преди да разопаковаш. Така
# случайно повреден или подменен архив не стига до сървъра.
if [ -f "${ARCHIVE_PATH}.sha256" ]; then
  log "Проверявам sha256…"
  ( cd "$(dirname "$ARCHIVE_PATH")" \
    && sha256sum -c "$(basename "$ARCHIVE_PATH").sha256" ) \
    || die "sha256 не съвпада — спирам (повреден или подменен архив)."
  ok "sha256 е валиден."
else
  warn "Няма ${ARCHIVE_PATH##*/}.sha256 — пропускам проверка на целостта (препоръчително я добави)."
fi

# ── 2) Разопаковай в нов release и нормализирай корена ────────────────────────
REL="$RELEASES_DIR/$TS"
mkdir -p "$REL"
case "$ARCHIVE_PATH" in
  *.zip)    command -v unzip >/dev/null || { apt-get update -y && apt-get install -y unzip; }
            unzip -q "$ARCHIVE_PATH" -d "$REL" ;;
  *.tar.gz) tar -xzf "$ARCHIVE_PATH" -C "$REL" ;;
  *)        die "Непознат формат на архива." ;;
esac
# GitHub ZIP слага едно горно ниво (напр. few-few-main/). Влез в него.
shopt -s nullglob dotglob
entries=( "$REL"/* )
if [ "${#entries[@]}" = "1" ] && [ -d "${entries[0]}" ] && [ ! -f "$REL/CLAUDE.md" ]; then
  SRC="${entries[0]}"
else
  SRC="$REL"
fi
shopt -u nullglob dotglob
[ -d "$SRC/zabobovdol" ] || [ -d "$SRC/medqr" ] || [ -d "$SRC/SupremeDiscordBot" ] || die "Архивът не прилича на това репо ($SRC)."
ok "Разопаковано в $SRC"

deploy_failed=0

# ── 3a) zabobovdol — Docker Compose ───────────────────────────────────────────
deploy_zabobovdol() {
  local d="$SRC/zabobovdol"
  [ -d "$d" ] || { warn "Няма zabobovdol/ в архива — пропускам."; return; }
  log "Разгръщам zabobovdol (Docker Compose)…"
  # Пренеси съществуващия .env (тайните живеят на сървъра, не в архива).
  if [ -f "$CURRENT_LINK/zabobovdol/.env" ] && [ ! -f "$d/.env" ]; then
    cp -a "$CURRENT_LINK/zabobovdol/.env" "$d/.env"; ok "Пренесох zabobovdol/.env"
  fi
  ( cd "$d"
    if [ -f .env ]; then
      local args=(); [ "$FORCE_SEED" = "1" ] && args+=(--seed)
      bash scripts/deploy.sh "${args[@]}"        # строи, вдига и сийдва (1-ви път)
    else
      warn "Няма zabobovdol/.env — пускам setup-env.sh интерактивно."
      bash scripts/setup-env.sh && bash scripts/deploy.sh
    fi
  )
  # Авто-засичане на порта от .env (HTTP_PORT), освен ако не е зададен изрично.
  local url="$ZBD_HEALTH_URL"
  if [ -z "${ZBD_HEALTH_URL_SET:-}" ] && [ -f "$d/.env" ]; then
    local p; p="$(grep -E '^HTTP_PORT=' "$d/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -dc '0-9')"
    [ -n "$p" ] && url="http://127.0.0.1:${p}/"
  fi
  health "$url" "zabobovdol" || deploy_failed=1
}

# ── 3b) medqr — systemd ───────────────────────────────────────────────────────
deploy_medqr() {
  local d="$SRC/medqr"
  [ -d "$d" ] || { warn "Няма medqr/ в архива — пропускам."; return; }
  log "Разгръщам medqr (systemd)…"
  id medqr >/dev/null 2>&1 || die "Липсва системен юзър medqr (виж medqr/deploy/DEPLOY.md)."
  # Бекъп на текущия код (data/ остава непокътната — извън rsync).
  [ -d "$MEDQR_DIR" ] && cp -a "$MEDQR_DIR" "${MEDQR_DIR}.bak-$TS"
  command -v rsync >/dev/null || { apt-get update -y && apt-get install -y rsync; }
  mkdir -p "$MEDQR_DIR"
  rsync -a --delete \
    --exclude data/ --exclude node_modules/ --exclude .env \
    "$d"/ "$MEDQR_DIR"/
  chown -R medqr:medqr "$MEDQR_DIR"
  ( cd "$MEDQR_DIR" && sudo -u medqr npm ci --omit=dev )
  # Консистентен snapshot на базата ПРЕДИ рестарт — миграциите се пускат при старт
  # (db.js), затова пазим възстановима точка. Не разчитаме на cp заради WAL.
  local db="$MEDQR_DIR/data/medqr.sqlite"
  local dbbak="${db}.pre-$TS"
  if [ -f "$db" ]; then
    sudo -u medqr sqlite3 "$db" ".backup '$dbbak'" || cp -a "$db" "$dbbak"
    log "Снимка на базата преди миграция: $dbbak"
  fi
  systemctl restart "$MEDQR_SERVICE"
  sleep 2
  if health "$MEDQR_HEALTH_URL" "medqr"; then
    rm -rf "${MEDQR_DIR}.bak-$TS"
    # Пазим последните няколко pre-миграционни снимки; чистим по-старите.
    ls -1t "${db}".pre-* 2>/dev/null | tail -n +6 | xargs -r rm -f
  else
    deploy_failed=1
    warn "medqr health провал — връщам предишния код и базата."
    systemctl stop "$MEDQR_SERVICE" || true
    if [ -f "$dbbak" ]; then
      cp -a "$dbbak" "$db"
      rm -f "${db}-wal" "${db}-shm" # изчистваме WAL от неуспешния старт
      chown medqr:medqr "$db"
    fi
    if [ -d "${MEDQR_DIR}.bak-$TS" ]; then
      rsync -a --delete --exclude data/ "${MEDQR_DIR}.bak-$TS"/ "$MEDQR_DIR"/
      chown -R medqr:medqr "$MEDQR_DIR"
    fi
    systemctl restart "$MEDQR_SERVICE"
  fi
}

# ── 3b') vizitka — systemd (огледално на medqr) ───────────────────────────────
deploy_vizitka() {
  local d="$SRC/vizitka"
  [ -d "$d" ] || { warn "Няма vizitka/ в архива — пропускам."; return; }
  log "Разгръщам vizitka (systemd)…"
  id vizitka >/dev/null 2>&1 || die "Липсва системен юзър vizitka (виж vizitka/deploy/DEPLOY.md)."
  # Бекъп на текущия код (data/ остава непокътната — извън rsync).
  [ -d "$VIZITKA_DIR" ] && cp -a "$VIZITKA_DIR" "${VIZITKA_DIR}.bak-$TS"
  command -v rsync >/dev/null || { apt-get update -y && apt-get install -y rsync; }
  mkdir -p "$VIZITKA_DIR"
  rsync -a --delete \
    --exclude data/ --exclude node_modules/ --exclude .env \
    "$d"/ "$VIZITKA_DIR"/
  chown -R vizitka:vizitka "$VIZITKA_DIR"
  ( cd "$VIZITKA_DIR" && sudo -u vizitka npm ci --omit=dev )
  # Снимка на базата ПРЕДИ рестарт — миграциите се пускат при старт (db.js).
  local db="$VIZITKA_DIR/data/vizitka.db"
  local dbbak="${db}.pre-$TS"
  if [ -f "$db" ]; then
    sudo -u vizitka sqlite3 "$db" ".backup '$dbbak'" || cp -a "$db" "$dbbak"
    log "Снимка на базата преди миграция: $dbbak"
  fi
  systemctl restart "$VIZITKA_SERVICE"
  sleep 2
  if health "$VIZITKA_HEALTH_URL" "vizitka"; then
    rm -rf "${VIZITKA_DIR}.bak-$TS"
    ls -1t "${db}".pre-* 2>/dev/null | tail -n +6 | xargs -r rm -f
  else
    deploy_failed=1
    warn "vizitka health провал — връщам предишния код и базата."
    systemctl stop "$VIZITKA_SERVICE" || true
    if [ -f "$dbbak" ]; then
      cp -a "$dbbak" "$db"
      rm -f "${db}-wal" "${db}-shm" # изчистваме WAL от неуспешния старт
      chown vizitka:vizitka "$db"
    fi
    if [ -d "${VIZITKA_DIR}.bak-$TS" ]; then
      rsync -a --delete --exclude data/ "${VIZITKA_DIR}.bak-$TS"/ "$VIZITKA_DIR"/
      chown -R vizitka:vizitka "$VIZITKA_DIR"
    fi
    systemctl restart "$VIZITKA_SERVICE"
  fi
}

# ── 3c) nexus — Docker Compose + persistent state ─────────────────────────────
deploy_nexus() {
  local d="$SRC/Nexus"
  [ -d "$d" ] || { warn "Няма Nexus/ в архива — пропускам."; return; }
  log "Разгръщам Nexus Dominion (Docker Compose)…"
  command -v docker >/dev/null || die "Липсва docker — инсталирай го преди да продължиш."
  command -v rsync  >/dev/null || { apt-get update -y && apt-get install -y rsync; }
  # State dir holds the live SQLite + .env. Compose mounts it as a volume.
  mkdir -p "$NEXUS_STATE_DIR/data"
  # First-time bootstrap: copy the template .env IFF the operator has not
  # already left one in place. We never overwrite an existing .env.
  if [ ! -f "$NEXUS_STATE_DIR/.env" ]; then
    if [ -f "$d/.env.example" ]; then
      cp "$d/.env.example" "$NEXUS_STATE_DIR/.env"
      chmod 600 "$NEXUS_STATE_DIR/.env"
      warn "Създадох $NEXUS_STATE_DIR/.env от .env.example — попълни тайните преди следващия restart."
    fi
  fi
  # Backup current code (state dir is untouched — it sits outside the release dir).
  [ -d "$NEXUS_DIR/source" ] && cp -a "$NEXUS_DIR/source" "$NEXUS_DIR/source.bak-$TS"
  mkdir -p "$NEXUS_DIR/source"
  rsync -a --delete \
    --exclude node_modules/ --exclude server/data/ --exclude server/.env --exclude .git/ \
    "$d"/ "$NEXUS_DIR/source"/
  # Link the operator-managed state into the release tree so the bundled
  # docker-compose.yml + server pick them up at their canonical paths.
  ln -sfn "$NEXUS_STATE_DIR/data" "$NEXUS_DIR/source/server/data"
  [ -f "$NEXUS_STATE_DIR/.env" ] && ln -sfn "$NEXUS_STATE_DIR/.env" "$NEXUS_DIR/source/server/.env"
  # Compose интерполира ${VAR:?} от .env в СВОЯТА директория (project root),
  # не от server/.env → без този symlink `up` гърми на JWT_SECRET.
  [ -f "$NEXUS_STATE_DIR/.env" ] && ln -sfn "$NEXUS_STATE_DIR/.env" "$NEXUS_DIR/source/.env"
  # Данните на bind mount в state (прости бекъпи; named volume иначе крие
  # базата в /var/lib/docker/volumes). Добавяме NEXUS_DATA_DIR еднократно.
  if [ -f "$NEXUS_STATE_DIR/.env" ] && ! grep -q '^NEXUS_DATA_DIR=' "$NEXUS_STATE_DIR/.env"; then
    printf '\n# Път до SQLite данните (bind mount в docker-compose.yml)\nNEXUS_DATA_DIR=%s\n' \
      "$NEXUS_STATE_DIR/data" >> "$NEXUS_STATE_DIR/.env"
  fi
  # Автоматичен release gate — блокира деплой с PLACEHOLDER правни данни,
  # некомерсиални асети или .dockerignore↔Dockerfile несъответствие.
  if [ -f "$NEXUS_DIR/source/scripts/release-gate.sh" ]; then
    ( cd "$NEXUS_DIR/source" && bash scripts/release-gate.sh ) \
      || die "nexus release gate провал — деплоят е спрян (виж ✗ редовете)."
  fi
  ( cd "$NEXUS_DIR/source" && docker compose build )
  # Bind mount-ът е root:root на хоста, а контейнерът върви като 'app'
  # (Dockerfile USER app) → без chown ПЪРВИЯТ boot не може да създаде
  # SQLite базата и умира тихо (открито на живия деплой 02.07). Взимаме
  # uid/gid на 'app' от самия образ; идемпотентно.
  app_uid=$(docker run --rm --entrypoint sh nexus-dominion:latest -c 'id -u app' 2>/dev/null || echo 100)
  app_gid=$(docker run --rm --entrypoint sh nexus-dominion:latest -c 'id -g app' 2>/dev/null || echo 101)
  chown -R "$app_uid:$app_gid" "$NEXUS_STATE_DIR/data"
  ( cd "$NEXUS_DIR/source" && docker compose up -d --remove-orphans )
  sleep 5
  if health "$NEXUS_HEALTH_URL" "nexus"; then
    rm -rf "$NEXUS_DIR/source.bak-$TS"
    # Самоинсталиране на systemd единиците (идемпотентно): стартиране на
    # стека при boot + дневен бекъп таймер. Никакви ръчни стъпки.
    if command -v systemctl >/dev/null; then
      install -m 644 "$NEXUS_DIR/source/deploy/nexus-dominion.service" /etc/systemd/system/nexus.service
      install -m 644 "$NEXUS_DIR/source/deploy/nexus-backup.service"   /etc/systemd/system/nexus-backup.service
      install -m 644 "$NEXUS_DIR/source/deploy/nexus-backup.timer"     /etc/systemd/system/nexus-backup.timer
      systemctl daemon-reload
      systemctl enable nexus.service >/dev/null 2>&1 || true
      systemctl enable --now nexus-backup.timer >/dev/null 2>&1 || true
      log "nexus systemd: boot unit + дневен бекъп таймер инсталирани."
    fi
  else
    deploy_failed=1
    warn "nexus health провал — връщам предишния код."
    if [ -d "$NEXUS_DIR/source.bak-$TS" ]; then
      rm -rf "$NEXUS_DIR/source"
      mv "$NEXUS_DIR/source.bak-$TS" "$NEXUS_DIR/source"
      ( cd "$NEXUS_DIR/source" && docker compose up -d --remove-orphans )
    fi
  fi
}

# ── 3d) supreme — Supreme Bot, Docker Compose ─────────────────────────────────
deploy_supreme() {
  local d="$SRC/SupremeDiscordBot"
  [ -d "$d" ] || { warn "Няма SupremeDiscordBot/ в архива — пропускам."; return; }
  log "Разгръщам Supreme Bot (Docker Compose)…"
  command -v docker >/dev/null || die "Липсва docker — инсталирай го преди да продължиш."
  # Пренеси съществуващите .env файлове (тайните живеят на сървъра, не в архива).
  # Четирите файла: корен (postgres интерполация), backend, bot и frontend
  # (frontend ползва build-time VITE_* — затова трябва да е на място ПРЕДИ билда).
  local f
  for f in .env backend/.env bot/.env frontend/.env; do
    if [ -f "$CURRENT_LINK/SupremeDiscordBot/$f" ] && [ ! -f "$d/$f" ]; then
      cp -a "$CURRENT_LINK/SupremeDiscordBot/$f" "$d/$f"; ok "Пренесох SupremeDiscordBot/$f"
    fi
  done
  ( cd "$d"
    # Собственият deploy.sh: проверява .env-ите, билдва, вдига, чака backend health
    # (миграциите се пускат автоматично в backend entrypoint-а) и регистрира
    # slash командите. Ако нещо липсва, той се проваля с ясна грешка.
    bash deploy.sh
  )
  # Health на публичния frontend порт (8080). Останалите services са вътрешни
  # и се валидират от Docker healthcheck-овете + от собствения deploy.sh.
  health "$SUPREME_HEALTH_URL" "SupremeDiscordBot" || deploy_failed=1
}

# ── Health check ──────────────────────────────────────────────────────────────
health() {
  local url="$1" name="$2" i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then ok "$name е жив ($url)"; return 0; fi
    sleep 3
  done
  warn "$name НЕ отговаря на $url"; return 1
}

for p in $PROJECTS; do
  case "$p" in
    zabobovdol) deploy_zabobovdol ;;
    medqr)      deploy_medqr ;;
    vizitka)    deploy_vizitka ;;
    nexus)      deploy_nexus ;;
    SupremeDiscordBot)    deploy_supreme ;;
    *)          warn "Непознат проект: $p" ;;
  esac
done

# ── 4) Маркирай текущия release + почисти старите ─────────────────────────────
ln -sfn "$SRC" "$CURRENT_LINK"
ok "current → $SRC"
ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

if [ "$deploy_failed" = "0" ]; then
  ok "Деплой готов ($TS). Проекти: $PROJECTS"
else
  die "Деплой завърши с грешки — виж изхода по-горе (направен е опит за rollback)."
fi
