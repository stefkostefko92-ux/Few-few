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
PROJECTS="${PROJECTS:-zabobovdol medqr nexus SupremeDiscordBot vizitka mastilko eternaltouch adblock}"
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

# mastilko (systemd модел, като medqr) — Next.js, билд на сървъра, порт 3200
# зад Nginx. Тайните (.env с GEMINI_API_KEY, по желание) живеят на сървъра.
MASTILKO_DIR="${MASTILKO_DIR:-/opt/mastilko}"
MASTILKO_SERVICE="${MASTILKO_SERVICE:-mastilko}"
MASTILKO_HEALTH_URL="${MASTILKO_HEALTH_URL:-http://127.0.0.1:3200/}"

# supreme (Supreme Bot — Docker Compose модел) — frontend nginx е единственият
# публикуван порт (127.0.0.1:8080), останалите services са вътрешни. backend
# контейнерът пуска `prisma migrate deploy` сам в entrypoint-а. Тайните живеят
# на сървъра в SupremeDiscordBot/.env (корен, postgres), SupremeDiscordBot/backend/.env, SupremeDiscordBot/bot/.env
# и SupremeDiscordBot/frontend/.env (build-time VITE_*); пренасят се при всеки деплой.
SUPREME_HEALTH_URL="${SUPREME_HEALTH_URL:-http://127.0.0.1:8080/}"

# eternaltouch (Eternal Touch — Docker Compose модел) — app:4300 + postgres:5437
# слушат само на 127.0.0.1, зад Nginx. Тайните живеят в eternaltouch/.env на
# сървъра (пренасят се при всеки деплой). Ако липсва .env при пръв деплой, генерираме
# го с random secrets (SMTP_PASS остава CHANGE_ME — попълва се ръчно веднъж).
ET_HEALTH_URL="${ET_HEALTH_URL:-http://127.0.0.1:4300/healthz}"

# adblock (Supreme AdBlock — ЧИСТ СТАТИЧЕН сайт, без билд/Node/база). Разширението
# тегли filters.json от адреса; index/privacy са малка витрина + политика за
# поверителност. Обслужва се от Caddy (авто-TLS). Файловете идват от репото
# (adblock/server/), няма тайни. TLS зависи от DNS запис към VPS-а (ръчна стъпка).
ADBLOCK_WWW="${ADBLOCK_WWW:-/var/www/adblock}"
ADBLOCK_DOMAIN="${ADBLOCK_DOMAIN:-adblock.carbonstealth.eu}"
CADDY_SITES_DIR="${CADDY_SITES_DIR:-/etc/caddy/sites}"
CADDY_MAIN="${CADDY_MAIN:-/etc/caddy/Caddyfile}"
CADDY_SERVICE="${CADDY_SERVICE:-caddy}"
ADBLOCK_HEALTH_URL="${ADBLOCK_HEALTH_URL:-https://adblock.carbonstealth.eu/filters.json}"
ADBLOCK_SIGNING_KEY="${ADBLOCK_SIGNING_KEY:-/etc/caddy/adblock-signing.key}"
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

# ── 3д) mastilko — systemd + Next.js билд на сървъра ──────────────────────────
deploy_mastilko() {
  local d="$SRC/mastilko"
  [ -d "$d" ] || { warn "Няма mastilko/ в архива — пропускам."; return; }
  log "Разгръщам mastilko (systemd, Next.js)…"
  command -v node >/dev/null || die "Липсва node — инсталирай Node.js ≥ 20."
  command -v rsync >/dev/null || { apt-get update -y && apt-get install -y rsync; }
  # Системен потребител — самосъздаващ се, идемпотентно.
  id mastilko >/dev/null 2>&1 || useradd --system --create-home --home-dir "$MASTILKO_DIR" \
    --shell /usr/sbin/nologin mastilko
  # Бекъп на текущия код (.env остава — rsync exclude го пази и от --delete).
  [ -d "$MASTILKO_DIR" ] && cp -a "$MASTILKO_DIR" "${MASTILKO_DIR}.bak-$TS"
  mkdir -p "$MASTILKO_DIR"
  rsync -a --delete \
    --exclude node_modules/ --exclude .next/ --exclude .env --exclude data/ \
    "$d"/ "$MASTILKO_DIR"/
  chown -R mastilko:mastilko "$MASTILKO_DIR"
  # Билд на сървъра: пълни зависимости → next build → сваляне до продукционни.
  ( cd "$MASTILKO_DIR" \
    && sudo -u mastilko npm ci \
    && sudo -u mastilko npm run build \
    && sudo -u mastilko npm prune --omit=dev )
  # ReadWritePaths в unit-а изисква пътищата да съществуват при старт.
  # data/ пази JSON-а на рекламните банери — НЕ се трие при деплой (rsync
  # exclude), за да оцелее между версиите като .env.
  sudo -u mastilko mkdir -p "$MASTILKO_DIR/.next/cache" "$MASTILKO_DIR/data"
  # systemd unit — самоинсталиращ се/обновяващ се при всеки деплой.
  install -m 644 "$MASTILKO_DIR/deploy/mastilko.service" /etc/systemd/system/mastilko.service
  systemctl daemon-reload
  systemctl enable "$MASTILKO_SERVICE" >/dev/null 2>&1 || true
  systemctl restart "$MASTILKO_SERVICE"
  sleep 2
  if health "$MASTILKO_HEALTH_URL" "mastilko"; then
    rm -rf "${MASTILKO_DIR}.bak-$TS"
    # Чистим стари .bak-ове от предишни провалени опити (пазим последните 2).
    ls -1dt "${MASTILKO_DIR}".bak-* 2>/dev/null | tail -n +3 | xargs -r rm -rf
    [ -f "$MASTILKO_DIR/.env" ] || warn "Няма $MASTILKO_DIR/.env — сайтът работи, но AI подсказките са изключени (виж mastilko/deploy/DEPLOY.md)."
    # Известяваме Bing/Yandex през IndexNow за обновените URL-и (не чупи деплоя).
    ( cd "$MASTILKO_DIR" && sudo -u mastilko node scripts/indexnow.mjs ) \
      || warn "IndexNow пропуснат (виж лога по-горе)."
  else
    deploy_failed=1
    warn "mastilko health провал — връщам предишния код."
    systemctl stop "$MASTILKO_SERVICE" || true
    if [ -d "${MASTILKO_DIR}.bak-$TS" ]; then
      rsync -a --delete --exclude .env --exclude data/ "${MASTILKO_DIR}.bak-$TS"/ "$MASTILKO_DIR"/
      chown -R mastilko:mastilko "$MASTILKO_DIR"
      systemctl restart "$MASTILKO_SERVICE"
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
# ── 3g) eternaltouch — Docker Compose ─────────────────────────────────────────
deploy_eternaltouch() {
  local d="$SRC/eternaltouch"
  [ -d "$d" ] || { warn "Няма eternaltouch/ в архива — пропускам."; return; }
  log "Разгръщам eternaltouch (Docker Compose)…"
  # Пренеси съществуващия .env (тайните живеят на сървъра, не в архива).
  if [ -f "$CURRENT_LINK/eternaltouch/.env" ] && [ ! -f "$d/.env" ]; then
    cp -a "$CURRENT_LINK/eternaltouch/.env" "$d/.env"; ok "Пренесох eternaltouch/.env"
  fi
  # Пръв деплой без .env: генерирай random secrets (app-ът иначе отказва да стартира).
  # SMTP_PASS остава CHANGE_ME — имейлите тръгват след като го попълниш веднъж ръчно.
  if [ ! -f "$d/.env" ]; then
    warn "Няма eternaltouch/.env — генерирам с random secrets (SMTP_PASS=CHANGE_ME)."
    local dbp jwt cks sks adp
    dbp="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9')"
    jwt="$(openssl rand -base64 48 | tr -d '\n')"
    cks="$(openssl rand -base64 48 | tr -d '\n')"
    sks="$(openssl rand -base64 48 | tr -d '\n')"
    adp="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9')"
    cat > "$d/.env" <<EOF
DB_PASSWORD=${dbp}
JWT_SECRET=${jwt}
COOKIE_SECRET=${cks}
SESSION_SECRET=${sks}
ADMIN_EMAIL=info@eternaltouch.it
ADMIN_PASSWORD=${adp}
SITE_URL=https://eternaltouch.it
NODE_ENV=production
PORT=4300
SMTP_HOST=authsmtp.register.it
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=info@eternaltouch.it
SMTP_PASS=CHANGE_ME
SMTP_FROM=Eternal Touch <info@eternaltouch.it>
NOTIFY_TO=info@eternaltouch.it
EOF
    chmod 600 "$d/.env"
    warn "Записах eternaltouch/.env. Админ парола: ${adp} — запиши я в password manager СЕГА."
    warn "Попълни SMTP_PASS в eternaltouch/.env, за да тръгнат имейлите."
  fi
  chmod 600 "$d/.env" 2>/dev/null || true
  ( cd "$d" && bash deploy.sh )   # idempotent: docker up --build, seed (upsert), nginx, certbot
  health "$ET_HEALTH_URL" "eternaltouch" || deploy_failed=1
}

# ── 3h) adblock — ЧИСТ СТАТИЧЕН сайт зад Caddy (без билд/Node/база) ────────────
# Копира само трите обслужвани файла в /var/www/adblock и инсталира/обновява
# Caddy сайт-блока (adblock/server/Caddyfile → /etc/caddy/sites/adblock.caddy,
# import в главния Caddyfile). Валидира преди reload → нула downtime. Идемпотентно:
# повторно пускане само презаписва файловете и презарежда конфига. Няма тайни.
deploy_adblock() {
  local d="$SRC/adblock/server"
  [ -d "$d" ] || { warn "Няма adblock/server/ в архива — пропускам."; return; }
  log "Разгръщам adblock (статичен сайт зад Caddy)…"
  command -v rsync >/dev/null || { apt-get update -y && apt-get install -y rsync; }

  # 1) Обслужвани файлове → www root. Копираме избрани файлове (без README/конфиг),
  # затова не ползваме --delete: други файлове в root-а (ако има) остават непокътнати.
  mkdir -p "$ADBLOCK_WWW"
  for f in index.html privacy.html filters.json robots.txt sitemap.xml llms.txt og.png; do
    [ -f "$d/$f" ] && rsync -a "$d/$f" "$ADBLOCK_WWW"/
  done
  # IndexNow ключ: материализираме <key>.txt в www root от indexnow_key.txt.
  if [ -f "$d/indexnow_key.txt" ]; then
    INKEY=$(tr -d '[:space:]' < "$d/indexnow_key.txt")
    [ -n "$INKEY" ] && printf '%s' "$INKEY" > "$ADBLOCK_WWW/$INKEY.txt"
  fi
  chmod 755 "$ADBLOCK_WWW"
  find "$ADBLOCK_WWW" -maxdepth 1 -type f -exec chmod 644 {} +
  # Собственик като другите статични пътища: caddy юзъра ако съществува, иначе root
  # (файловете и без това са world-readable — уеб сървърът ги чете).
  if id caddy >/dev/null 2>&1; then chown -R caddy:caddy "$ADBLOCK_WWW"; fi
  ok "adblock файлове → $ADBLOCK_WWW"

  # 1а) Ed25519 подпис на filters.json (разширението го проверява при ъпдейт).
  # Ключът живее САМО на сървъра (виж adblock/server/README.md); без ключ —
  # без подпис, разширението приема ъпдейта както досега.
  if [ -f "$ADBLOCK_SIGNING_KEY" ]; then
    if openssl pkeyutl -sign -inkey "$ADBLOCK_SIGNING_KEY" -rawin \
        -in "$ADBLOCK_WWW/filters.json" 2>/dev/null | base64 -w0 > "$ADBLOCK_WWW/filters.json.sig" \
        && [ -s "$ADBLOCK_WWW/filters.json.sig" ]; then
      chmod 644 "$ADBLOCK_WWW/filters.json.sig"
      if id caddy >/dev/null 2>&1; then chown caddy:caddy "$ADBLOCK_WWW/filters.json.sig"; fi
      ok "adblock: filters.json подписан (filters.json.sig)"
    else
      rm -f "$ADBLOCK_WWW/filters.json.sig"
      warn "adblock: подписването провали — премахнах .sig, ъпдейтите вървят неподписани."
    fi
  fi

  # 2) Уеб сървър. Предпочитаме Caddy (авто-TLS); на сървъри с Nginx (моделът на
  # останалите продукти тук) инсталираме Nginx vhost + certbot. Без нито един —
  # файловете остават на място с предупреждение (не чупим другите проекти).
  if ! command -v caddy >/dev/null && command -v nginx >/dev/null; then
    local nsite="/etc/nginx/sites-available/adblock.conf"
    [ -f "$nsite" ] && cp -a "$nsite" "${nsite}.bak-$TS"
    install -m 644 "$d/nginx.conf" "$nsite"
    ln -sf "$nsite" /etc/nginx/sites-enabled/adblock.conf
    if nginx -t >/dev/null 2>&1; then
      systemctl reload nginx 2>/dev/null || nginx -s reload
      rm -f "${nsite}.bak-$TS"
      ok "adblock: Nginx vhost инсталиран и презареден ($ADBLOCK_DOMAIN)."
      # TLS през certbot. Пускаме го при ВСЕКИ деплой (идемпотентно): нашият
      # vhost темплейт е само HTTP, а всеки деплой го презаписва — затова
      # трябва отново да инжектираме SSL блока. При съществуващ валиден
      # сертификат certbot само преинсталира конфига и НЕ иска нов
      # (--keep-until-expiring), значи не удря rate limits.
      if command -v certbot >/dev/null; then
        if certbot --nginx -d "$ADBLOCK_DOMAIN" -n --agree-tos --redirect --keep-until-expiring >/dev/null 2>&1; then
          ok "adblock: TLS активен (certbot преинсталира SSL конфига)."
          systemctl reload nginx 2>/dev/null || nginx -s reload
        else
          warn "adblock: certbot не успя (DNS още не сочи насам?). Пусни ръчно: certbot --nginx -d $ADBLOCK_DOMAIN"
        fi
      fi
    else
      deploy_failed=1
      warn "adblock: nginx -t провал — връщам стария vhost, НЕ презареждам."
      if [ -f "${nsite}.bak-$TS" ]; then mv -f "${nsite}.bak-$TS" "$nsite"; else rm -f "$nsite" /etc/nginx/sites-enabled/adblock.conf; fi
      return
    fi
    if curl -fsS -o /dev/null --max-time 5 "$ADBLOCK_HEALTH_URL"; then
      ok "adblock е жив ($ADBLOCK_HEALTH_URL)"
    else
      warn "adblock: публичният health още не минава ($ADBLOCK_HEALTH_URL) — провери DNS A запис към този VPS."
    fi
    indexnow_ping "${INKEY:-}"
    return
  fi
  if ! command -v caddy >/dev/null; then
    warn "adblock: няма нито caddy, нито nginx — файловете са в $ADBLOCK_WWW, но сайтът не е публикуван."
    return
  fi
  mkdir -p "$CADDY_SITES_DIR"
  local site="$CADDY_SITES_DIR/adblock.caddy"
  # Бекъп на текущия сайт-блок (ако има) за rollback при невалиден конфиг.
  [ -f "$site" ] && cp -a "$site" "${site}.bak-$TS"
  install -m 644 "$d/Caddyfile" "$site"
  # Увери се, че главният Caddyfile import-ва sites/ (идемпотентно). import е
  # относителен спрямо Caddyfile-а → sites/*.caddy = $CADDY_SITES_DIR/*.caddy.
  if [ -f "$CADDY_MAIN" ]; then
    grep -q 'import sites/\*' "$CADDY_MAIN" \
      || printf '\n# Сайт-блокове по подразбиране (adblock и др.)\nimport sites/*.caddy\n' >> "$CADDY_MAIN"
  else
    printf '# Главен Caddyfile\nimport sites/*.caddy\n' > "$CADDY_MAIN"
  fi

  # 3) Валидирай ПРЕДИ reload — невалиден конфиг не стига до живия Caddy.
  if ! caddy validate --config "$CADDY_MAIN" --adapter caddyfile >/dev/null 2>&1; then
    deploy_failed=1
    warn "adblock: caddy validate провал — връщам стария сайт-блок, НЕ презареждам."
    if [ -f "${site}.bak-$TS" ]; then mv -f "${site}.bak-$TS" "$site"; else rm -f "$site"; fi
    return
  fi
  rm -f "${site}.bak-$TS"

  # 4) Reload без downtime (graceful). Предпочитаме systemd, иначе caddy reload.
  if command -v systemctl >/dev/null && systemctl list-unit-files 2>/dev/null | grep -q "^${CADDY_SERVICE}.service"; then
    systemctl reload "$CADDY_SERVICE" || systemctl restart "$CADDY_SERVICE"
  else
    caddy reload --config "$CADDY_MAIN" --adapter caddyfile
  fi
  ok "adblock: Caddy сайт-блок инсталиран и презареден ($ADBLOCK_DOMAIN)."

  # 5) Health (best-effort): публичният HTTPS минава само след като DNS A/AAAA
  # сочи VPS-а и Caddy издаде TLS сертификат — това е РЪЧНА стъпка на собственика.
  # Затова провалът тук е предупреждение, не блокира деплоя на другите проекти.
  if curl -fsS -o /dev/null --max-time 5 "$ADBLOCK_HEALTH_URL"; then
    ok "adblock е жив ($ADBLOCK_HEALTH_URL)"
  else
    warn "adblock: публичният health още не минава ($ADBLOCK_HEALTH_URL). Файловете и Caddy конфигът са на място — провери DNS A/AAAA към VPS-а и TLS сертификата."
  fi
  indexnow_ping "${INKEY:-}"
}

health() {
  local url="$1" name="$2" i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then ok "$name е жив ($url)"; return 0; fi
    sleep 3
  done
  warn "$name НЕ отговаря на $url"; return 1
}

# IndexNow: уведомява Bing/Yandex/Seznam/Naver с един POST (api.indexnow.org
# ги разпраща). Ключът е публичен (hostнат като <key>.txt). Best-effort.
indexnow_ping() {
  local key="$1"; [ -n "$key" ] || return 0
  local base="https://$ADBLOCK_DOMAIN"
  local body='{"host":"'"$ADBLOCK_DOMAIN"'","key":"'"$key"'","keyLocation":"'"$base/$key.txt"'","urlList":["'"$base/"'","'"$base/privacy"'"]}'
  if curl -fsS -m 10 -H "Content-Type: application/json" -d "$body" https://api.indexnow.org/indexnow >/dev/null 2>&1; then
    ok "adblock: IndexNow уведоми Bing/Yandex/Seznam (submit)."
  else
    warn "adblock: IndexNow ping не мина (сайтът трябва да е публично достъпен с $key.txt)."
  fi
}

for p in $PROJECTS; do
  case "$p" in
    zabobovdol) deploy_zabobovdol ;;
    medqr)      deploy_medqr ;;
    vizitka)    deploy_vizitka ;;
    nexus)      deploy_nexus ;;
    mastilko)   deploy_mastilko ;;
    SupremeDiscordBot)    deploy_supreme ;;
    eternaltouch)         deploy_eternaltouch ;;
    adblock)    deploy_adblock ;;
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
