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
PROJECTS="${PROJECTS:-zabobovdol medqr nexus SupremeDiscordBot vizitka mastilko eternaltouch adblock ospedali vpsdash panev piuma}"
ARCHIVE_DIR="${ARCHIVE_DIR:-/root}"           # където качваш архива ръчно
RELEASES_DIR="${RELEASES_DIR:-/opt/few-few/releases}"
CURRENT_LINK="${CURRENT_LINK:-/opt/few-few/current}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

# medqr (systemd модел)
MEDQR_DIR="${MEDQR_DIR:-/opt/medqr}"
MEDQR_SERVICE="${MEDQR_SERVICE:-medqr}"
MEDQR_HEALTH_URL="${MEDQR_HEALTH_URL:-http://127.0.0.1:3000/healthz}"
# Маркер за идентичност: „/“ зад HTTPS редиректа даваше 308 и гейтът минаваше за всеки процес на порта.
MEDQR_HEALTH_EXPECT="${MEDQR_HEALTH_EXPECT:-\"app\":\"medqr\"}"

# ВНИМАНИЕ за всяко присвояване по-долу, което чете ПО ИЗБОР налична стойност:
# `X="$(cmd 2>/dev/null | head -1)"` при `set -euo pipefail` УБИВА скрипта, ако
# cmd се провали (липсващ файл → sed/grep код 2, pipefail го вдига, set -e
# прекратява) — и то БЕЗ нито един ред изход, защото stderr е заглушен. Затова
# всяко такова присвояване завършва с `|| true`; стойността по подразбиране е на
# следващия ред. Реален инцидент: липсващ /etc/vizitka/vizitka.env спираше ЦЕЛИЯ
# autodeploy още в конфигурацията, преди първия проект (гейтнато от deploy-check).
#
# vizitka (systemd модел, като medqr)
VIZITKA_DIR="${VIZITKA_DIR:-/opt/vizitka}"
VIZITKA_SERVICE="${VIZITKA_SERVICE:-vizitka}"
# Портът се ЧЕТЕ от живия env файл, не се предполага. На споделена машина 3100 може
# да е зает от друг проект (тук: docker-proxy на ERP) и тогава health check-ът
# получаваше 200 от ЧУЖДО приложение → деплоят се обявяваше за успешен дори когато
# vizitka е мъртва, значи клонът за rollback не се изпълняваше никога.
VIZITKA_PORT="${VIZITKA_PORT:-$(sed -n 's/^PORT=//p' /etc/vizitka/vizitka.env 2>/dev/null | head -1 || true)}"
VIZITKA_PORT="${VIZITKA_PORT:-3105}"
# /healthz връща и ИМЕТО на приложението — само код 200 не доказва кой отговаря.
VIZITKA_HEALTH_URL="${VIZITKA_HEALTH_URL:-http://127.0.0.1:${VIZITKA_PORT}/healthz}"
# node-ът, с който тръгва услугата (ExecStart в vizitka.service) — с него се проверява
# нативният модул след npm ci.
VIZITKA_NODE="${VIZITKA_NODE:-$(sed -n 's#^ExecStart=\([^ ]*node\) .*#\1#p' /etc/systemd/system/vizitka.service 2>/dev/null | head -1 || true)}"
VIZITKA_NODE="${VIZITKA_NODE:-/usr/bin/node}"

# panev (Panev Ascensori — systemd модел, като medqr/vizitka). Express сервира
# предварително генерираните статични страници (корен + en/ + bg/) + /api/contact
# + server-side /admin (JWT + SQLite). Слуша САМО на 127.0.0.1:4102 зад nginx,
# който прави 301 от www.panevascensori.it към каноничния non-www домейн.
# Оцеляват деплоя: тайните (/etc/panev/panev.env, 600 — systemd EnvironmentFile)
# и базата (/opt/panev/data/panev.db — единственият записваем път в unit-а).
PANEV_DIR="${PANEV_DIR:-/opt/panev}"
PANEV_SERVICE="${PANEV_SERVICE:-panev}"
PANEV_ENV="${PANEV_ENV:-/etc/panev/panev.env}"
PANEV_HEALTH_URL="${PANEV_HEALTH_URL:-http://127.0.0.1:4102/api/health}"

# ospedali (Ospedali Trasparenti — systemd модел, като medqr/vizitka, НО без npm
# ci/build: лек Node сервиз с нула зависимости обслужва предбилднатия статичен сайт
# от site/. Деплоят е само копиране на файлове + рестарт. Тайните
# (OSPEDALI_ADMIN_PASSWORD, OSPEDALI_SESSION_SECRET) и рънтайм състоянието
# (server/.state/) живеят на сървъра и се пренасят при всеки деплой.
OSPEDALI_DIR="${OSPEDALI_DIR:-/opt/ospedali}"
OSPEDALI_SERVICE="${OSPEDALI_SERVICE:-ospedali}"
OSPEDALI_HEALTH_URL="${OSPEDALI_HEALTH_URL:-http://127.0.0.1:8788/healthz}"

# Nexus Dominion — Docker Compose; expose the server on 127.0.0.1:4000
# behind nginx/Caddy. State (server/data + server/.env) lives outside
# the release dir and is carried over on every redeploy.
NEXUS_DIR="${NEXUS_DIR:-/opt/nexus}"
NEXUS_STATE_DIR="${NEXUS_STATE_DIR:-/opt/nexus/state}"
NEXUS_HEALTH_URL="${NEXUS_HEALTH_URL:-http://127.0.0.1:4000/api/health}"

# zabobovdol (Docker Compose модел) — портът се авто-засича от неговия .env (HTTP_PORT),
# освен ако ZBD_HEALTH_URL не е зададен изрично.
ZBD_HEALTH_URL_SET="${ZBD_HEALTH_URL:+1}"
# /api/health прави SELECT 1 към базата и връща {"ok":true}. Докато сондата гледаше „/“, 200 от
# страница, рендирана без база (или от ДРУГО приложение на порта), минаваше за жив деплой.
ZBD_HEALTH_URL="${ZBD_HEALTH_URL:-http://127.0.0.1:80/api/health}"
ZBD_HEALTH_EXPECT='"ok":true'
# СТАБИЛЕН дом на тайните на zabobovdol, ИЗВЪН releases/ (600). Реалният риск: .env се пренасяше
# само от `current`; ако липсва (current сочи release без zabobovdol), setup-env.sh генерираше НОВ
# POSTGRES_PASSWORD, който не пасва на съществуващата база → продукцията пада след миграцията.
ZBD_ENV="${ZBD_ENV:-/opt/few-few/shared/zabobovdol/.env}"
ZBD_BACKUPS="${ZBD_BACKUPS:-/opt/few-few/shared/zabobovdol/backups}"
ZBD_SITE="${ZBD_SITE:-https://zabobovdol.carbonstealth.eu}"
ZBD_INDEXNOW="${ZBD_INDEXNOW:-1}"
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
# Бекъпи на Supreme Bot: pre-deploy снимка (некриптирана, краткоживееща, пазим 5)
# + дневният криптиран бекъп от supreme-backup.timer (DPA §5.1). Общ път, mode 700.
SUPREME_BACKUP_DIR="${SUPREME_BACKUP_DIR:-/var/backups/supreme}"
# СТАБИЛЕН дом на четирите .env файла на Supreme, ИЗВЪН releases/ (mode 700/600).
# ЗАЩО (реален инцидент, 17.09.2026): тайните живееха само в release папката на
# последния Supreme деплой и се пренасяха САМО от `current`. Но `current` се мести
# при всеки успешен деплой на КОЙТО И ДА Е продукт от същия архив (напр.
# PROJECTS="adblock") → сочи release, в който Supreme никога не е разгръщан и няма
# .env → следващият Supreme деплой пада на „[1/4] Missing: backend/.env …" СЛЕД
# като е направил pg_dump. А release-ът с тайните е под ножа на KEEP_RELEASES (и на
# чистенето от панела) след още няколко деплоя — тоест тайните могат да изчезнат
# от диска без никой да ги е трил нарочно. Оттук: source = shared → current →
# най-новият release, който ги има; след всеки пробег shared се обновява.
SUPREME_ENV_DIR="${SUPREME_ENV_DIR:-/opt/few-few/shared/SupremeDiscordBot}"
SUPREME_ENV_FILES=".env backend/.env bot/.env frontend/.env"

# eternaltouch (Eternal Touch — Docker Compose модел) — app:4300 + postgres:5437
# слушат само на 127.0.0.1, зад Nginx. Тайните живеят в eternaltouch/.env на
# сървъра (пренасят се при всеки деплой). Ако липсва .env при пръв деплой, генерираме
# го с random secrets (SMTP_PASS остава CHANGE_ME — попълва се ръчно веднъж).
ET_HEALTH_URL="${ET_HEALTH_URL:-http://127.0.0.1:4300/healthz}"

# piuma (Piuma — Instagram контент-двигател; Docker Compose модел). Пет услуги:
# postgres · redis · app · worker · вътрешен nginx. Навън стърчи САМО вътрешният
# nginx, и то на 127.0.0.1:${HTTP_PORT:-4310} — TLS-ът се пази от nginx-а на хоста.
# Тайните живеят в piuma/.env на сървъра (mode 600) и се пренасят при всеки деплой;
# БЕЗ .env compose отказва да тръгне (`${VAR:?}`) — това е нарочно, а не пропуск:
# Piuma държи Instagram токени и агентски ключове, тоест да се вдигне с изфабрикувани
# тайни е по-лошо от това да не се вдигне. Портът се чете от .env (HTTP_PORT).
PIUMA_HEALTH_URL_SET="${PIUMA_HEALTH_URL:+1}"
PIUMA_HEALTH_URL="${PIUMA_HEALTH_URL:-http://127.0.0.1:4310/health}"
# Каноничният дом на тайните — СТАБИЛЕН път извън releases/. При пръв деплой `current`
# сочи към release без piuma/, тоест „пренеси от текущия" няма откъде; без този път
# инструкцията „сложи го в current/piuma/.env" сочеше папка, която още не съществува.
PIUMA_ENV="${PIUMA_ENV:-/opt/few-few/shared/piuma/.env}"

# vps-dashboard (Carbon Stealth VPS Dashboard — systemd, Node ≥20, нула runtime
# зависимости). Панелът управлява СЪРВЪРА → върви като root (виж service unit-а),
# слуша само на 127.0.0.1:7700 зад Nginx+TLS. Конфигът с тайните/паролата живее в
# /etc/vps-dashboard/config.json (mode 600) — създава се веднъж от install.sh и се
# пази между деплоите. Деплоят е rsync на кода + рестарт (билд не е нужен).
VPSDASH_DIR="${VPSDASH_DIR:-/opt/vps-dashboard}"
VPSDASH_SERVICE="${VPSDASH_SERVICE:-vps-dashboard}"
VPSDASH_HEALTH_URL="${VPSDASH_HEALTH_URL:-http://127.0.0.1:7700/api/ping}"

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

# ── 1) Намери архива (или ползвай вече разопакован release) ───────────────────
# RELEASE_DIR=<път> прескача архива и разгръща от съществуващ release. Това е
# ВРЪЩАНЕ НАЗАД (rollback): кодът на стария release вече е на диска, няма какво
# да се разопакова. Панелът (vps-dashboard) ползва точно това.
#   sudo RELEASE_DIR=/opt/few-few/releases/20260101-120000 bash .../autodeploy.sh
if [ -n "${RELEASE_DIR:-}" ]; then
  [ -d "$RELEASE_DIR" ] || die "Няма такъв release: $RELEASE_DIR"
  # Приеми както корена на release-а, така и вложената папка от GitHub ZIP.
  SRC="$RELEASE_DIR"
  if [ ! -f "$SRC/CLAUDE.md" ]; then
    shopt -s nullglob dotglob
    rel_entries=( "$RELEASE_DIR"/* )
    shopt -u nullglob dotglob
    if [ "${#rel_entries[@]}" = "1" ] && [ -d "${rel_entries[0]}" ]; then SRC="${rel_entries[0]}"; fi
  fi
  log "Разгръщам от съществуващ release (без архив): $SRC"
fi

find_archive() {
  if [ -n "${ARCHIVE:-}" ]; then echo "$ARCHIVE"; return; fi
  # най-новият .zip/.tar.gz в ARCHIVE_DIR
  local a
  a="$(ls -t "$ARCHIVE_DIR"/*.zip "$ARCHIVE_DIR"/*.tar.gz 2>/dev/null | head -1 || true)"
  [ -n "$a" ] || die "Няма архив в $ARCHIVE_DIR (качи .zip или .tar.gz)."
  echo "$a"
}
if [ -z "${RELEASE_DIR:-}" ]; then
  ARCHIVE_PATH="$(find_archive)"
  log "Архив: $ARCHIVE_PATH"

  # ── 1б) Проверка на целостта (по избор) ─────────────────────────────────────
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

  # ── 2) Разопаковай в нов release и нормализирай корена ─────────────────────
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
fi
[ -d "$SRC/zabobovdol" ] || [ -d "$SRC/medqr" ] || [ -d "$SRC/SupremeDiscordBot" ] || [ -d "$SRC/vizitka" ] || [ -d "$SRC/ospedalitrasparenti" ] || [ -d "$SRC/ospedali" ] || die "Източникът не прилича на това репо ($SRC)."
ok "Източник за деплой: $SRC"

deploy_failed=0

# Пренася .env (тайните) на Compose продукт в новия release и го пази на стабилен
# път. Преди се четеше САМО от `current` — а деплой само на друг продукт (напр.
# PROJECTS="vizitka") мести `current` към release БЕЗ този .env; следващият деплой
# не го намираше и eternaltouch си генерираше НОВИ пароли за базата (стар Postgres
# том + нова парола = паднал сайт), а zabobovdol искаше интерактивен setup.
# Ред: споделеният път → `current` → най-новият стар release, който го има.
carry_env() {
  local proj="$1" d="$2" shared="/opt/few-few/shared/$1/.env" src="" r
  if [ ! -f "$d/.env" ]; then
    if [ -f "$shared" ]; then
      src="$shared"
    elif [ -f "$CURRENT_LINK/$proj/.env" ]; then
      src="$CURRENT_LINK/$proj/.env"
    else
      for r in $(ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null || true); do
        [ "${r%/}" = "${SRC%/}" ] && continue
        if [ -f "$r$proj/.env" ]; then src="$r$proj/.env"; break; fi
      done
    fi
    if [ -n "$src" ]; then cp -a "$src" "$d/.env"; ok "Пренесох $proj/.env от $src"; fi
  fi
  # Първият намерен .env става каноничен — оттук нататък не зависи от `current`.
  if [ -f "$d/.env" ] && [ ! -f "$shared" ]; then
    install -D -m 600 "$d/.env" "$shared" && ok "Запазих $proj/.env в $shared"
  fi
}

# ── 3a) zabobovdol — Docker Compose ───────────────────────────────────────────
# Откъде да дойде .env: стабилният дом → current → най-новият release, който го има. Печата пътя.
zbd_env_source() {
  local cand
  for cand in "$ZBD_ENV" "$CURRENT_LINK/zabobovdol/.env"; do
    if [ -f "$cand" ]; then printf '%s\n' "$cand"; return 0; fi
  done
  cand="$(find "$RELEASES_DIR" -maxdepth 4 -path '*/zabobovdol/.env' 2>/dev/null | sort -r | head -1 || true)"
  [ -n "$cand" ] || return 1
  printf '%s\n' "$cand"
}

# Има ли следи от съществуваща инсталация (дъмп или Docker volume)? Тогава нов .env е ОПАСЕН.
zbd_has_data() {
  # Всеки шаблон поотделно: `ls a b c` пада, ако дори един няма съвпадение — тогава наличен .dump
  # не се виждаше и скриптът генерираше нови тайни (хванато от autodeploy-zbd.test.mjs).
  # Всеки непразен видим файл е следа: backup-db.sh пише *.sql.gz.age / *.sql.gz.gpg, а тесен глоб
  # (.dump/.sql/.sql.gz) ги пропускаше → нови тайни при миграция (Разбивача, 2026-09-24).
  # Търси се рекурсивно и през симлинкове (поддиректории, скрити файлове); само *.partial
  # (незавършен запис от backup-db.sh) не се брои (Разбивача, мисия 4).
  if [ -d "$ZBD_BACKUPS" ] && [ -n "$(find -L "$ZBD_BACKUPS" -type f -size +0 ! -name '*.partial' -print -quit 2>/dev/null)" ]; then
    return 0
  fi
  # Неуспешна проверка = „има данни“: спрян Docker демон не бива да води до нови тайни.
  if command -v docker >/dev/null 2>&1; then
    local vols
    vols="$(docker volume ls -q 2>/dev/null)" || return 0
    printf '%s\n' "$vols" | grep -q 'zabobovdol' && return 0
  fi
  return 1
}

# Огледай .env в стабилния дом (600). Идемпотентно; никога не печата съдържание.
zbd_persist_env() {
  local from="$1"
  [ -f "$from" ] || return 0
  install -d -m 700 "$(dirname "$ZBD_ENV")"
  cmp -s "$from" "$ZBD_ENV" 2>/dev/null || cp -a "$from" "$ZBD_ENV"
  chmod 600 "$ZBD_ENV"
}

# URL-ът на сондата: изричният ZBD_HEALTH_URL побеждава; иначе портът от .env (HTTP_PORT).
zbd_health_url() {
  local envf="$1" p
  if [ -z "${ZBD_HEALTH_URL_SET:-}" ] && [ -f "$envf" ]; then
    p="$(grep -E '^HTTP_PORT=' "$envf" 2>/dev/null | head -1 | cut -d= -f2 | tr -dc '0-9' || true)"
    [ -n "$p" ] && { printf 'http://127.0.0.1:%s/api/health\n' "$p"; return 0; }
  fi
  printf '%s\n' "$ZBD_HEALTH_URL"
}

# Откат САМО на кода: вдига предишния release на zabobovdol със същото compose име. Базата не се
# пипа — миграциите са адитивни по правило (prisma-migrate skill), значи старият код работи с нея.
zbd_rollback() {
  local prev="$1"
  [ -n "$prev" ] && [ -d "$prev" ] || { warn "zabobovdol: няма предишен release за откат — оставям както е."; return 1; }
  warn "zabobovdol: връщам предишния код ($prev)…"
  ( cd "$prev" && if docker compose version >/dev/null 2>&1; then docker compose up -d --build; else docker-compose up -d --build; fi ) \
    || { warn "zabobovdol: откатът не вдигна предишния код — нужен е човек."; return 1; }
  return 0
}

zbd_ping_indexnow() {
  [ "$ZBD_INDEXNOW" = "1" ] || return 0
  ( cd "$SRC" && node tools/seo/indexnow.mjs "$ZBD_SITE" --key-location "$ZBD_SITE/indexnow-key.txt" ) \
    || warn "zabobovdol: IndexNow подаването пропадна — не е фатално (ключът се сервира от /indexnow-key.txt)."
}

deploy_zabobovdol() {
  local d="$SRC/zabobovdol"
  [ -d "$d" ] || { warn "Няма zabobovdol/ в архива — пропускам."; return; }
  log "Разгръщам zabobovdol (Docker Compose)…"
  # Предишният работещ код (за откат) — current още сочи стария release, мести се само при успех.
  local prev=""
  [ -d "$CURRENT_LINK/zabobovdol" ] && prev="$(readlink -f "$CURRENT_LINK/zabobovdol" || true)"
  [ "$prev" = "$(readlink -f "$d")" ] && prev=""
  # Тайните живеят на сървъра, не в архива: стабилен дом → current → най-нов release.
  if [ ! -f "$d/.env" ]; then
    local src_env; src_env="$(zbd_env_source || true)"
    if [ -n "$src_env" ]; then
      cp -a "$src_env" "$d/.env"; chmod 600 "$d/.env"; ok "Пренесох zabobovdol/.env"
    elif zbd_has_data; then
      # Fail closed: нов .env = нова парола за СЪЩЕСТВУВАЩА база → продукцията пада.
      warn "zabobovdol: .env липсва навсякъде, а има данни от предишна инсталация — НЕ генерирам нови тайни. Възстанови $ZBD_ENV (600) и пусни пак."
      deploy_failed=1; return
    fi
  fi
  # Бекъпите живеят на СТАБИЛЕН път извън releases — иначе умират с прочистването
  # на старите releases (KEEP_RELEASES) и историята се губи при всеки деплой.
  mkdir -p "$ZBD_BACKUPS"
  rm -rf "$d/backups"
  ln -sfnT "$ZBD_BACKUPS" "$d/backups"
  ok "zabobovdol/backups -> $ZBD_BACKUPS"
  # `|| { … return; }` НЕ е украса: скриптът върви под `set -euo pipefail`, значи
  # ненулев изход от subshell-а убива ЦЕЛИЯ autodeploy насред пробега — всички
  # следващи проекти в $PROJECTS остават неразгърнати, symlink-ът и резюмето се
  # прескачат, а базата вече е мигрирана и контейнерите вдигнати. Провалът на
  # един продукт трябва да е провал на ЕДИН продукт. (VPS-аджията, одит 07.08.2026)
  ( cd "$d"
    if [ -f .env ]; then
      local args=(); [ "$FORCE_SEED" = "1" ] && args+=(--seed)
      bash scripts/deploy.sh "${args[@]}"        # строи, вдига и сийдва (1-ви път)
    else
      warn "Няма zabobovdol/.env и няма следи от данни — първа инсталация: пускам setup-env.sh."
      bash scripts/setup-env.sh && bash scripts/deploy.sh
    fi
  ) || { warn "zabobovdol: deploy.sh се провали — продължавам с останалите проекти."; zbd_rollback "$prev" || true; deploy_failed=1; return; }
  zbd_persist_env "$d/.env"
  local url; url="$(zbd_health_url "$d/.env")"
  if health "$url" "zabobovdol" "$ZBD_HEALTH_EXPECT"; then
    zbd_ping_indexnow
  else
    zbd_rollback "$prev" && health "$(zbd_health_url "$prev/.env")" "zabobovdol (предишен код)" "$ZBD_HEALTH_EXPECT" || true
    deploy_failed=1
  fi
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
  ( cd "$MEDQR_DIR" && sudo -u medqr npm ci --omit=dev ) \
    || { warn "medqr: npm ci се провали след rsync — кодът вече е сменен, връщам предишния."; medqr_rollback; deploy_failed=1; return; }
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
  if health "$MEDQR_HEALTH_URL" "medqr" "$MEDQR_HEALTH_EXPECT"; then
    rm -rf "${MEDQR_DIR}.bak-$TS"
    # Пазим последните няколко pre-миграционни снимки; чистим по-старите.
    ls -1t "${db}".pre-* 2>/dev/null | tail -n +6 | xargs -r rm -f || true
  else
    deploy_failed=1
    warn "medqr health провал — връщам предишния код и базата."
    medqr_rollback "${db:-}" "${dbbak:-}"
  fi
}

# Откатът на medqr — изваден във функция, защото има ДВА пътя дотук:
# провален health (по-долу) и провален `npm ci` СЛЕД rsync (кодът вече е сменен,
# зависимостите ги няма). Второто дълго време просто убиваше целия autodeploy.
# (VPS-аджията, одит 07.08.2026)
medqr_rollback() {
  local db="${1:-}" dbbak="${2:-}"
  systemctl stop "$MEDQR_SERVICE" || true
  if [ -n "$dbbak" ] && [ -f "$dbbak" ]; then
    cp -a "$dbbak" "$db"
    rm -f "${db}-wal" "${db}-shm" # изчистваме WAL от неуспешния старт
    chown medqr:medqr "$db"
  fi
  if [ -d "${MEDQR_DIR}.bak-$TS" ]; then
    rsync -a --delete --exclude data/ "${MEDQR_DIR}.bak-$TS"/ "$MEDQR_DIR"/
    chown -R medqr:medqr "$MEDQR_DIR"
  fi
  systemctl restart "$MEDQR_SERVICE"
}

# ── 3b') vizitka — systemd (огледално на medqr) ───────────────────────────────
deploy_vizitka() {
  local d="$SRC/vizitka"
  [ -d "$d" ] || { warn "Няма vizitka/ в архива — пропускам."; return; }
  log "Разгръщам vizitka (systemd)…"
  id vizitka >/dev/null 2>&1 || die "Липсва системен юзър vizitka (виж vizitka/deploy/DEPLOY.md)."
  command -v rsync >/dev/null || { apt-get update -y && apt-get install -y rsync; }
  # Бекъп на текущия код БЕЗ data/: там са базата и качените снимки (лични данни) —
  # `cp -a` на цялата папка ги дублираше в .bak, който оставаше на диска при провал.
  # node_modules влиза нарочно: откатът трябва да върне и работещите зависимости.
  local bak="${VIZITKA_DIR}.bak-$TS"
  if [ -f "$VIZITKA_DIR/package.json" ]; then
    rsync -a --exclude data/ "$VIZITKA_DIR"/ "$bak"/
  fi
  # Връща кода (и зависимостите) от бекъпа; data/ не се пипа.
  vizitka_restore_code() {
    [ -d "$bak" ] || return 0
    rsync -a --delete --exclude data/ "$bak"/ "$VIZITKA_DIR"/
    chown -R vizitka:vizitka "$VIZITKA_DIR"
    rm -rf "$bak"
  }
  mkdir -p "$VIZITKA_DIR"
  rsync -a --delete \
    --exclude data/ --exclude node_modules/ --exclude .env \
    "$d"/ "$VIZITKA_DIR"/
  chown -R vizitka:vizitka "$VIZITKA_DIR"
  # При провал на npm ci кодът на диска ВЕЧЕ е новият, а node_modules — полуподменени:
  # „старата услуга остава жива“ важеше само до следващия рестарт (ъпдейт, OOM, reboot),
  # който щеше да вдигне счупена комбинация. Затова връщаме и кода.
  # `npm ls` след това НЕ е излишен: npm понякога се срива („Exit handler never called!“)
  # с изход 0 и оставя node_modules непълни (хванато на генерална репетиция — рестартът
  # вдигаше код без express, а само health проверката го връщаше, след секунди престой).
  # Последната проверка зарежда нативния модул (better-sqlite3) със СЪЩИЯ node, с който
  # тръгва услугата (ExecStart). npm ci компилира за node-а от PATH на sudo; ако на
  # машината има две версии, модулът е за грешната (NODE_MODULE_VERSION) и услугата
  # умира при старт — пак хванато на репетиция, пак с престой до отката.
  if ! ( cd "$VIZITKA_DIR" && sudo -u vizitka npm ci --omit=dev \
    && sudo -u vizitka npm ls --omit=dev --depth=0 >/dev/null \
    && sudo -u vizitka "$VIZITKA_NODE" -e "new (require('better-sqlite3'))(':memory:').close()" ); then
    warn "vizitka: npm ci се провали — връщам предишния код; услугата не е рестартирана."
    vizitka_restore_code
    deploy_failed=1; return
  fi
  # Снимка на базата ПРЕДИ рестарт — миграциите се пускат при старт (db.js). Само с
  # онлайн backup API (sqlite3 CLI или better-sqlite3), който включва и WAL: голо `cp`
  # на .db при жива услуга пропуска записите, които още са в -wal файла.
  local db="$VIZITKA_DIR/data/vizitka.db"
  local dbbak="${db}.pre-$TS"
  if [ -f "$db" ]; then
    if ! { command -v sqlite3 >/dev/null && sudo -u vizitka sqlite3 "$db" ".backup '$dbbak'"; } &&
      ! ( cd "$VIZITKA_DIR" && sudo -u vizitka node -e \
        "new (require('better-sqlite3'))(process.argv[1],{readonly:true}).backup(process.argv[2]).then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1)})" \
        "$db" "$dbbak" ); then
      warn "vizitka: снимката на базата не стана — НЕ рестартирам (миграция без бекъп)."
      vizitka_restore_code
      deploy_failed=1; return
    fi
    log "Снимка на базата преди миграция: $dbbak"
  fi
  systemctl restart "$VIZITKA_SERVICE"
  sleep 2
  if health "$VIZITKA_HEALTH_URL" "vizitka" '"app":"vizitka"'; then
    rm -rf "$bak"
    ls -1t "${db}".pre-* 2>/dev/null | tail -n +6 | xargs -r rm -f || true
  else
    deploy_failed=1
    warn "vizitka health провал — връщам предишния код и базата."
    systemctl stop "$VIZITKA_SERVICE" || true
    if [ -f "$dbbak" ]; then
      cp -a "$dbbak" "$db"
      rm -f "${db}-wal" "${db}-shm" # изчистваме WAL от неуспешния старт
      chown vizitka:vizitka "$db"
    fi
    vizitka_restore_code
    systemctl restart "$VIZITKA_SERVICE"
  fi
}

# ── 3b''') panev — systemd (огледално на medqr/vizitka) ──────────────────────
# Разликите: тайните са в /etc/panev/panev.env (EnvironmentFile, 600) — НЕ в
# директорията на кода, значи rsync --delete не може да ги докосне; при първо
# пускане се сийдва базата (админ + каталог за /admin), после никога.
deploy_panev() {
  local d="$SRC/panev"
  [ -d "$d" ] || { warn "Няма panev/ в архива — пропускам."; return; }
  log "Разгръщам panev (systemd, Express + SQLite)…"
  command -v node  >/dev/null || die "Липсва node — инсталирай Node.js ≥ 20."
  command -v rsync >/dev/null || { apt-get update -y && apt-get install -y rsync; }
  # Системен потребител — самосъздаващ се, идемпотентно.
  id panev >/dev/null 2>&1 || useradd --system --home-dir "$PANEV_DIR" \
    --shell /usr/sbin/nologin panev

  # 1) Тайни. Без валиден JWT_SECRET (≥32 знака) приложението УМИРА при старт в
  # продукция (panev/lib/auth.js) — затова при първи деплой генерираме файла.
  if [ ! -f "$PANEV_ENV" ]; then
    warn "Няма $PANEV_ENV — генерирам с random JWT_SECRET (SMTP_PASS=CHANGE_ME)."
    # Групата е panev, за да може услугата/сийдът да ЧЕТАТ файла (самият файл
    # остава 600 panev:panev — без traverse права никой друг не влиза в папката).
    install -d -m 750 -o root -g panev "$(dirname "$PANEV_ENV")"
    install -o panev -g panev -m 600 /dev/null "$PANEV_ENV"
    cat > "$PANEV_ENV" <<EOF
NODE_ENV=production
PORT=4102
# Каноничният домейн е БЕЗ www (canonical/hreflang/sitemap/JSON-LD са non-www);
# nginx прави 301 от www.panevascensori.it насам.
BASE_URL=https://panevascensori.it
JWT_SECRET=$(openssl rand -hex 64)
JWT_EXPIRES=4h
ADMIN_EMAIL=info@panevascensori.it
# Без SMTP_PASS формата записва запитването в базата, но НЕ праща имейл.
SMTP_HOST=smtps.aruba.it
SMTP_PORT=465
SMTP_USER=info@panevascensori.it
SMTP_PASS=CHANGE_ME
MAIL_FROM="Panev Ascensori <info@panevascensori.it>"
MAIL_TO_ADMIN=info@panevascensori.it
EOF
    warn "Попълни SMTP_PASS в $PANEV_ENV, за да тръгнат имейлите от формата."
  fi
  chmod 600 "$PANEV_ENV"; chown panev:panev "$PANEV_ENV"

  # 2) Код. data/ (SQLite) и node_modules/ остават извън rsync → преживяват деплоя.
  # .env в директорията на кода се изключва нарочно: в продукция стойностите идват
  # от EnvironmentFile-а, а случаен .env от архива само би объркал.
  # Бекъп САМО при реален предишен деплой. bootstrap-vps.sh вече е създал
  # $PANEV_DIR (той е HOME на системния потребител), затова „директорията
  # съществува" НЕ значи „има какво да се върне": при първи деплой това правеше
  # снимка на празна папка и откатът я връщаше с rsync --delete, т.е. ИЗТРИВАШЕ
  # току-що качения код. Маркерът за истински предишен деплой е package.json.
  local prev=0
  if [ -f "$PANEV_DIR/package.json" ]; then
    prev=1
    cp -a "$PANEV_DIR" "${PANEV_DIR}.bak-$TS"
  fi
  mkdir -p "$PANEV_DIR"
  # .npm/ е кешът на npm (HOME на потребителя е $PANEV_DIR) — пази го, за да не
  # тегли всичко наново при всеки деплой.
  rsync -a --delete \
    --exclude data/ --exclude node_modules/ --exclude .env --exclude .npm/ \
    "$d"/ "$PANEV_DIR"/
  chown -R panev:panev "$PANEV_DIR"
  # nginx сервира /img /fonts /css /js /docs директно от диска → нужен му е
  # достъп за четене през директорията (файловете са публични; data/ остава 700).
  chmod 755 "$PANEV_DIR"
  install -d -o panev -g panev -m 700 "$PANEV_DIR/data"
  ( cd "$PANEV_DIR" && sudo -u panev npm ci --omit=dev ) \
    || { warn "panev: npm ci се провали — бекъпът е в ${PANEV_DIR}.bak-$TS."; deploy_failed=1; return; }

  # 3) Първо пускане → сийд (админ + каталог за /admin). Сийдът е идемпотентен,
  # но го пускаме само при липсваща база. Ако ADMIN_PASSWORD не е зададена,
  # seed.js показва генерирана парола ВЕДНЪЖ в изхода тук.
  local db="$PANEV_DIR/data/panev.db"
  if [ ! -f "$db" ]; then
    log "Първо пускане на panev — сийдвам базата…"
    sudo -u panev bash -c 'set -a; . "$1"; set +a; cd "$2" && node scripts/seed.js' \
      _ "$PANEV_ENV" "$PANEV_DIR" \
      || warn "panev: сийдът не мина — влез после ръчно (виж panev/DEPLOY.md)."
  fi

  # 4) Снимка на базата ПРЕДИ рестарт (миграциите/схемата се прилагат при старт).
  local dbbak="${db}.pre-$TS"
  if [ -f "$db" ]; then
    sudo -u panev sqlite3 "$db" ".backup '$dbbak'" || cp -a "$db" "$dbbak"
    log "Снимка на базата преди рестарт: $dbbak"
  fi

  # 5) systemd unit — самоинсталиращ се/обновяващ се при всеки деплой.
  install -m 644 "$PANEV_DIR/deploy/systemd/panev.service" /etc/systemd/system/panev.service
  systemctl daemon-reload
  systemctl enable "$PANEV_SERVICE" >/dev/null 2>&1 || true
  systemctl restart "$PANEV_SERVICE"
  sleep 2
  if health "$PANEV_HEALTH_URL" "panev"; then
    rm -rf "${PANEV_DIR}.bak-$TS"
    ls -1t "${db}".pre-* 2>/dev/null | tail -n +6 | xargs -r rm -f || true
    ls -1dt "${PANEV_DIR}".bak-* 2>/dev/null | tail -n +3 | xargs -r rm -rf || true
    grep -q '^SMTP_PASS=CHANGE_ME$' "$PANEV_ENV" 2>/dev/null \
      && warn "panev: SMTP_PASS все още е CHANGE_ME — формата пише в базата, но НЕ праща имейл."
    [ -e /etc/nginx/sites-enabled/panev.conf ] \
      || warn "panev: няма /etc/nginx/sites-enabled/panev.conf — сайтът върви само на 127.0.0.1:4102 (виж panev/DEPLOY.md)."
  else
    deploy_failed=1
    warn "panev health провал — спирам услугата и връщам базата (кодът само при наличен предишен деплой)."
    systemctl stop "$PANEV_SERVICE" || true
    if [ -f "$dbbak" ]; then
      cp -a "$dbbak" "$db"
      rm -f "${db}-wal" "${db}-shm" # изчистваме WAL от неуспешния старт
      chown panev:panev "$db"
    fi
    if [ "$prev" = 1 ] && [ -d "${PANEV_DIR}.bak-$TS" ]; then
      rsync -a --delete --exclude data/ "${PANEV_DIR}.bak-$TS"/ "$PANEV_DIR"/
      chown -R panev:panev "$PANEV_DIR"
      chmod 755 "$PANEV_DIR"
      install -m 644 "$PANEV_DIR/deploy/systemd/panev.service" /etc/systemd/system/panev.service
      systemctl daemon-reload
      systemctl restart "$PANEV_SERVICE" || true
    else
      # Първи деплой: няма предишна версия за връщане. Кодът ОСТАВА на диска —
      # иначе следващият опит няма какво да рестартира, а диагнозата изчезва
      # заедно с директорията. Услугата остава спряна; причината е в journalctl.
      warn "panev: първи деплой — няма предишна версия. Кодът остава в $PANEV_DIR, услугата остава спряна (виж: journalctl -u $PANEV_SERVICE -b)."
    fi
  fi
}

# ── 3b'') ospedali — systemd, БЕЗ npm ci/build (нула зависимости) ─────────────
# За разлика от medqr/vizitka: сервизът няма зависимости и обслужва предбилднатия
# статичен сайт от site/ (вече в git) → само rsync на файловете + рестарт. Тайните
# (server/.env) и рънтайм състоянието (server/.state/ — брояч + видимост + хеш на
# админ паролата) се ИЗКЛЮЧВАТ от rsync → оцеляват между версиите. Health + rollback.
deploy_ospedali() {
  # Папката в репото е ospedalitrasparenti/ (преименувана); старото име ospedali/
  # се приема като fallback, за да работят и по-стари архиви. Деплой ключът,
  # systemd услугата и /opt/ospedali на сървъра НЕ се променят.
  local d="$SRC/ospedalitrasparenti"
  [ -d "$d" ] || d="$SRC/ospedali"
  [ -d "$d" ] || { warn "Няма ospedalitrasparenti/ (нито ospedali/) в архива — пропускам."; return; }
  log "Разгръщам ospedali (systemd, нула зависимости, без билд)…"
  command -v node >/dev/null || die "Липсва node — инсталирай Node.js ≥ 20."
  command -v rsync >/dev/null || { apt-get update -y && apt-get install -y rsync; }
  # Сервизът върви като www-data (споделен уеб потребител, виж ospedali.service).
  id www-data >/dev/null 2>&1 || die "Липсва системен потребител www-data."
  # Бекъп на текущия код (server/.env и server/.state/ се пазят — excludes долу).
  [ -d "$OSPEDALI_DIR" ] && cp -a "$OSPEDALI_DIR" "${OSPEDALI_DIR}.bak-$TS"
  mkdir -p "$OSPEDALI_DIR"
  # Изключваме тайните, рънтайм състоянието и суровите ETL данни (не се сервират).
  rsync -a --delete \
    --exclude server/.env --exclude server/.state/ \
    --exclude node_modules/ --exclude data/raw/ --exclude data/contratti/ \
    "$d"/ "$OSPEDALI_DIR"/
  chown -R www-data:www-data "$OSPEDALI_DIR"
  # .state/ трябва да съществува ПРЕДИ старт: ProtectSystem=strict прави всичко
  # извън ReadWritePaths само за четене, а config.js прави mkdir на .state само ако
  # родителят е записваем. Създаваме го тук (идемпотентно).
  install -d -o www-data -g www-data -m 700 "$OSPEDALI_DIR/server/.state"
  # systemd unit — самоинсталиращ се/обновяващ се при всеки деплой.
  install -m 644 "$OSPEDALI_DIR/deploy/systemd/ospedali.service" /etc/systemd/system/ospedali.service
  systemctl daemon-reload
  systemctl enable "$OSPEDALI_SERVICE" >/dev/null 2>&1 || true
  systemctl restart "$OSPEDALI_SERVICE"
  sleep 2
  if health "$OSPEDALI_HEALTH_URL" "ospedali"; then
    rm -rf "${OSPEDALI_DIR}.bak-$TS"
    # Чистим стари .bak-ове от предишни провалени опити (пазим последните 2).
    ls -1dt "${OSPEDALI_DIR}".bak-* 2>/dev/null | tail -n +3 | xargs -r rm -rf || true
    [ -f "$OSPEDALI_DIR/server/.env" ] || warn "Няма $OSPEDALI_DIR/server/.env — сайтът работи, но админ паролата е случайна (виж journalctl -u ospedali). За продукция задай OSPEDALI_ADMIN_PASSWORD + OSPEDALI_SESSION_SECRET (виж ospedalitrasparenti/deploy/DEPLOY.md)."
    # IndexNow — активно уведоми търсачките (Bing/Yandex) за URL-ите. ВИНАГИ след
    # успешен деплой. Best-effort: иска сайтът да е жив зад публичния домейн+TLS, за
    # да се верифицира ключът; при първия деплой (преди DNS/certbot) може да падне —
    # не е фатално, при следващия деплой минава.
    ( cd "$OSPEDALI_DIR" && node src/indexnow.js ) || warn "IndexNow подаване пропадна (сайтът може още да не е достъпен на публичния домейн) — не е фатално, минава при следващия деплой."
  else
    deploy_failed=1
    warn "ospedali health провал — връщам предишния код."
    systemctl stop "$OSPEDALI_SERVICE" || true
    if [ -d "${OSPEDALI_DIR}.bak-$TS" ]; then
      rsync -a --delete --exclude server/.env --exclude server/.state/ \
        "${OSPEDALI_DIR}.bak-$TS"/ "$OSPEDALI_DIR"/
      chown -R www-data:www-data "$OSPEDALI_DIR"
      systemctl restart "$OSPEDALI_SERVICE"
    fi
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
  ( cd "$NEXUS_DIR/source" && docker compose build ) \
    || { warn "nexus: docker compose build се провали — старите контейнери остават живи."; deploy_failed=1; return; }
  # Bind mount-ът е root:root на хоста, а контейнерът върви като 'app'
  # (Dockerfile USER app) → без chown ПЪРВИЯТ boot не може да създаде
  # SQLite базата и умира тихо (открито на живия деплой 02.07). Взимаме
  # uid/gid на 'app' от самия образ; идемпотентно.
  app_uid=$(docker run --rm --entrypoint sh nexus-dominion:latest -c 'id -u app' 2>/dev/null || echo 100)
  app_gid=$(docker run --rm --entrypoint sh nexus-dominion:latest -c 'id -g app' 2>/dev/null || echo 101)
  chown -R "$app_uid:$app_gid" "$NEXUS_STATE_DIR/data"
  ( cd "$NEXUS_DIR/source" && docker compose up -d --remove-orphans ) \
    || { warn "nexus: docker compose up се провали — старите контейнери остават както са."; deploy_failed=1; return; }
  sleep 5
  if health "$NEXUS_HEALTH_URL" "nexus"; then
    # Content seed на ВСЕКИ деплой (идемпотентен INSERT OR REPLACE по slug):
    # нови чудовища/предмети/сетове от release-а влизат в живата база, без
    # да пипат играчите. Без това content ъпдейт стига само до нови инсталации.
    ( cd "$NEXUS_DIR/source" && docker compose exec -T nexus-dominion node server/dist/seed/run.js ) \
      && log "nexus: content seed приложен (идемпотентно)." \
      || warn "nexus: seed стъпката се провали — content-ът може да е непълен (виж docker logs)."
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
      # Това е САМИЯТ откат — провалът му е последната лоша новина, но не бива
      # да прекратява пробега преди резюмето и преди останалите продукти.
      ( cd "$NEXUS_DIR/source" && docker compose up -d --remove-orphans ) \
        || warn "nexus: и откатът не успя да вдигне предишната версия — иска ръчна намеса."
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
  # Версията в service worker-а = този релийз, иначе `activate` не чисти
  # старите кешове (филтрира по неизменен литерал) и статичният кеш расте.
  sed -i "s|^const VERSION = \".*\";|const VERSION = \"mastilko-$TS\";|" \
    "$MASTILKO_DIR/public/sw.js" 2>/dev/null || warn "sw.js: версията не е пренаписана"
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
    ls -1dt "${MASTILKO_DIR}".bak-* 2>/dev/null | tail -n +3 | xargs -r rm -rf || true
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
  # Източникът се ТЪРСИ (shared → current → най-нов release с файловете), не се
  # предполага, че е `current` — виж SUPREME_ENV_DIR в конфигурацията.
  local f src_env=""
  src_env="$(supreme_env_source || true)"
  if [ -n "$src_env" ]; then
    for f in $SUPREME_ENV_FILES; do
      if [ -f "$src_env/$f" ] && [ ! -f "$d/$f" ]; then
        cp -a "$src_env/$f" "$d/$f"; chmod 600 "$d/$f"; ok "Пренесох SupremeDiscordBot/$f (от $src_env)"
      fi
    done
  fi
  # Fail-closed И РАНО. Досега липсващ .env се откриваше чак от deploy.sh на
  # стъпка [1/4] — СЛЕД pg_dump и с подкана „cp .env.example .env", която на
  # продукционен сървър е грешният съвет (тайните съществуват, само не са тук).
  local missing=""
  for f in $SUPREME_ENV_FILES; do [ -f "$d/$f" ] || missing="$missing $f"; done
  if [ -n "$missing" ]; then
    warn "Supreme: липсват .env файлове:$missing"
    warn "Supreme: търсих в $SUPREME_ENV_DIR, $CURRENT_LINK/SupremeDiscordBot и $RELEASES_DIR/*/*/SupremeDiscordBot — няма ги никъде."
    warn "Supreme: възстанови ги в $SUPREME_ENV_DIR (от работещите контейнери — SupremeDiscordBot/deploy/RELEASE-3.4.0.md §6) и пусни деплоя пак. НЕ ги създавай от .env.example."
    deploy_failed=1; return
  fi
  # v40 — Redis вече иска парола (`--requirepass` в docker-compose.yml). Старият
  # .env на сървъра няма REDIS_PASSWORD, а compose е нарочно fail-closed → без
  # този блок ПЪРВИЯТ деплой след промяната умира с неразбираема грешка от
  # интерполацията. Тайната се генерира на сървъра; идемпотентно.
  supreme_ensure_redis_password "$d"
  # Каквото ще се разгърне, е и каноничното — запиши го на стабилния път СЕГА,
  # преди deploy.sh: провал на билда не прави тайните по-малко верни.
  supreme_persist_env "$d"

  # Дъмп ПРЕДИ миграция (по модела на medqr/zabobovdol). Миграциите се пускат
  # автоматично в backend entrypoint-а при `up`, затова застраховката трябва да
  # е направена ПРЕДИ deploy.sh. Fail-closed: няма дъмп → няма деплой.
  supreme_pre_deploy_dump || { deploy_failed=1; return; }
  # `|| { … return; }` НЕ е украса: скриптът върви под `set -euo pipefail`, значи
  # ненулев изход от subshell-а убива ЦЕЛИЯ autodeploy насред пробега — всички
  # следващи проекти в $PROJECTS остават неразгърнати, symlink-ът и резюмето се
  # прескачат, а базата вече е мигрирана и контейнерите вдигнати. Провалът на
  # един продукт трябва да е провал на ЕДИН продукт. (VPS-аджията, одит 07.08.2026)
  ( cd "$d"
    # Собственият deploy.sh: проверява .env-ите, билдва, вдига, чака backend health
    # (миграциите се пускат автоматично в backend entrypoint-а) и регистрира
    # slash командите. Ако нещо липсва, той се проваля с ясна грешка.
    # IndexNow се подава от ТОЗИ скрипт, и то само след зелен smoke — не от
    # deploy.sh преди health (одит на VPS-аджията 25.09.2026).
    SUPREME_SKIP_INDEXNOW=1 bash deploy.sh
  ) || { warn "SupremeDiscordBot: deploy.sh се провали."; deploy_failed=1; supreme_rollback_hint "$d"; return; }
  # Health на публичния frontend порт (8080). Останалите services са вътрешни
  # и се валидират от Docker healthcheck-овете + от собствения deploy.sh.
  if health "$SUPREME_HEALTH_URL" "SupremeDiscordBot"; then
    # Health-check-ът казва само „нещо отговаря на 8080". Smoke тестът пита
    # ПРОДУКТА: React корен, пререндирани маршрути, база, Redis, Discord
    # gateway, гардът за вход, Stripe цените, правните страници, SEO
    # артефактите. Точно тихите провали, които един 200 подминава.
    # (Одит, 07.08.2026)
    if bash "$d/deploy/smoke.sh"; then
      ok "SupremeDiscordBot: smoke мина"
      supreme_ping_indexnow "$d"   # търсачките — само към работещ release
    else
      warn "SupremeDiscordBot: smoke ПАДНА — деплоят е горе, но нещо не работи."
      deploy_failed=1
      supreme_rollback_hint "$d"
    fi
    supreme_install_backup_timer "$d"
    supreme_install_restore_drill_timer "$d"
  else
    deploy_failed=1
    supreme_rollback_hint "$d"
  fi
}

# ── Откат на Supreme: РЪЧЕН, и това е нарочно ────────────────────────────────
# medqr/vizitka/mastilko се връщат сами (rsync на .bak + рестарт на systemd unit).
# Supreme е Docker Compose със СПОДЕЛЕНА Postgres база, върху която entrypoint-ът
# вече е пуснал `prisma migrate deploy` — връщане на кода назад НЕ връща схемата,
# а нова схема със стар код е по-лошо състояние от текущото. Затова тук не
# гадаем: печатаме точната команда и оставяме човек да реши.
#
# (VPS-аджията, одит 07.08.2026 — дотогава провалът само вдигаше флаг и мълчеше.)
supreme_rollback_hint() {
  # Работещият release е този, към който сочи `current` — при провал на Supreme
  # `current` НЕ се мести. Преди тук стоеше „вторият най-нов release“ (грешен при
  # повторен опит), път без вложената папка на архива и без PROJECTS — командата
  # щеше да върне назад и останалите продукти (одит на VPS-аджията 25.09.2026).
  local live
  live="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
  warn "Supreme НЯМА автоматичен откат (Compose + вече мигрирана база)."
  if [ -n "$live" ] && [ -f "$live/deploy/autodeploy.sh" ]; then
    warn "Работещ release (current): $live"
    warn "Откат на КОДА:  sudo RELEASE_DIR='$live' PROJECTS='SupremeDiscordBot' bash '$live/deploy/autodeploy.sh'"
    warn "Ако старият код е преди v3.5.0 и базата вече е мигрирана до v50: първо"
    warn "  SKIP_SCHEMA_CHECK=1 в $SUPREME_ENV_DIR/backend/.env (разликата е само 13 излишни таблици)."
  else
    warn "Няма работещ release в $CURRENT_LINK — това е първият деплой."
  fi
  warn "ВНИМАНИЕ: миграциите вече са приложени. Ако новата схема е несъвместима"
  warn "със стария код, първо провери 'npx prisma migrate status' в backend контейнера."
}

# IndexNow след деплой — правилото на репото (root CLAUDE.md) иска подаване след
# всяка промяна, засягаща откриваемост. Ключът вече се материализира в web root;
# липсваше само самото извикване, затова досега беше РЪЧНА стъпка, която лесно се
# забравя. Не е фатално: при провал минава при следващия деплой.
#
# ЗАЩО СЕ ПОДАВА ЯВНО (реален деплой, 07.08.2026): функцията НАМИРАШЕ ключа, а
# после викаше инструмента без него — той падаше обратно към конвенционалния
# `<siteUrl>/indexnow-key.txt`, какъвто Supreme НЯМА: ключът стои на `<key>.txt`.
# И понеже фронтендът е SPA (`try_files … /index.html`), онзи адрес връща 200 с
# index.html, а не 404 — тоест провалът изглеждаше като „липсващ ключ" за ключ,
# който е налице и се сервира коректно. Едно правило, две определения.
supreme_ping_indexnow() {
  local d="$1"
  local key_file key
  key_file="$(ls "$d"/frontend/public/*.txt 2>/dev/null | grep -E '/[0-9a-f]{32}\.txt$' | head -1 || true)"
  [ -n "$key_file" ] || { warn "Supreme: няма IndexNow ключ в frontend/public — пропускам."; return 0; }
  key="$(basename "$key_file" .txt)"
  ( cd "$SRC" && node tools/seo/indexnow.mjs "https://supremebot.carbonstealth.eu" \
      --key-file "$key_file" \
      --key-location "https://supremebot.carbonstealth.eu/${key}.txt" ) \
    || warn "Supreme: IndexNow подаването пропадна — не е фатално, минава при следващия деплой."
}

# Репетицията за възстановяване е БЕЗПОЛЕЗНА, ако никой не я пуска. Бекъпите си
# имаха таймер, самата репетиция — не, тоест „можем ли да възстановим" беше
# надежда, не факт. Седмично, в неделя през нощта. (Одит, 07.08.2026)
supreme_install_restore_drill_timer() {
  local d="$1"
  local drill="$d/deploy/restore-drill.sh"
  [ -f "$drill" ] || return 0
  install -m 700 "$drill" /usr/local/sbin/supreme-restore-drill
  cat > /etc/systemd/system/supreme-restore-drill.service <<'UNIT'
[Unit]
Description=Supreme — репетиция на възстановяването от последния бекъп
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/supreme-restore-drill
UNIT
  cat > /etc/systemd/system/supreme-restore-drill.timer <<'UNIT'
[Unit]
Description=Седмична репетиция на възстановяването (бекъп, който не е репетиран, е надежда)
[Timer]
OnCalendar=Sun 04:30
Persistent=true
RandomizedDelaySec=900
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now supreme-restore-drill.timer >/dev/null 2>&1 \
    || warn "supreme-restore-drill.timer не се активира — провери ръчно."
  ok "репетицията за възстановяване е седмична (supreme-restore-drill.timer)"
}

# Откъде да пренесем .env файловете на Supreme — ТРИ източника, по ред на доверие:
#   1) $SUPREME_ENV_DIR — каноничното копие; преди всеки пробег в него се слива
#      по-пресният файл от current (редакцията може да е и на двете места);
#   2) $CURRENT_LINK/SupremeDiscordBot — ако shared още не съществува;
#   3) най-новият release под $RELEASES_DIR, който ги има — резерва за сървър,
#      деплойван само със стария скрипт (преди shared да съществува).
# Критерий за „има ги" е backend/.env — той е задължителен и никога не се
# генерира. Печата ПЪТ, не съдържание; при нищо намерено връща 1.
supreme_env_source() {
  local cand
  # shared ПЪРВО: огледалото преди всеки пробег (supreme_persist_env от current)
  # вече е слело по-пресния от двата файла там — shared е каноничното копие.
  for cand in "$SUPREME_ENV_DIR" "$CURRENT_LINK/SupremeDiscordBot"; do
    if [ -f "$cand/backend/.env" ]; then printf '%s\n' "$cand"; return 0; fi
  done
  # releases/<TS>/<корен-от-ZIP>/SupremeDiscordBot/backend/.env → 5 нива; сортът по
  # път е сорт по TS (лексикографски = хронологичен), най-новият отгоре.
  cand="$(find "$RELEASES_DIR" -maxdepth 5 -path '*/SupremeDiscordBot/backend/.env' 2>/dev/null | sort -r | head -1 || true)"
  [ -n "$cand" ] || return 1
  printf '%s\n' "${cand%/backend/.env}"
}

# Огледай четирите .env файла от $1 в $SUPREME_ENV_DIR (700/600). Идемпотентно:
# пише само при разлика; липсващ в $1 файл НЕ трие огледалото (по-старо копие е
# по-добро от никакво). Никога не печата съдържание.
supreme_persist_env() {
  local from="$1" f
  [ -f "$from/backend/.env" ] || return 0
  install -d -m 700 "$SUPREME_ENV_DIR" "$SUPREME_ENV_DIR/backend" "$SUPREME_ENV_DIR/bot" "$SUPREME_ENV_DIR/frontend"
  for f in $SUPREME_ENV_FILES; do
    [ -f "$from/$f" ] || continue
    # По-ПРЕСНИЯТ печели (одит на VPS-аджията 25.09.2026): бележките за 3.5.0
    # казват „редактирай в shared/“, старите — „в current/“. Безусловното копие
    # current → shared триеше прясна редакция в shared (напр. SKU-тата) със
    # старото копие. `cp -a` пази mtime, затова огледалото не се „осъвременява“.
    if [ ! -f "$SUPREME_ENV_DIR/$f" ] || { ! cmp -s "$from/$f" "$SUPREME_ENV_DIR/$f" && [ "$from/$f" -nt "$SUPREME_ENV_DIR/$f" ]; }; then
      cp -a "$from/$f" "$SUPREME_ENV_DIR/$f"
    fi
    chmod 600 "$SUPREME_ENV_DIR/$f"
  done
  chmod 700 "$SUPREME_ENV_DIR"
}

# v40 — тайната за Redis: генерирай, ако липсва, и изравни REDIS_URL.
#
# ЗАЩО: docker-compose.yml вече пуска Redis с `--requirepass` и е нарочно
# fail-closed (`${REDIS_PASSWORD:?...}`). Пренесеният от сървъра .env е от преди
# промяната и няма такава променлива → ПЪРВИЯТ деплой след нея умира с грешка от
# интерполацията на compose, а не с нещо разбираемо. Тайната се ражда НА СЪРВЪРА
# (никога в репото или архива), mode 600.
#
# Само добавя/поправя; НИКОГА не презаписва вече зададена парола — смяната ѝ би
# обезсилила живите сесии на формите при рестарт на Redis. Идемпотентно.
supreme_ensure_redis_password() {
  local d="$1"
  local root="$d/.env"
  local pass=""

  [ -f "$root" ] || { warn "Supreme: няма .env — deploy.sh ще каже какво липсва."; return 0; }

  pass="$(sed -n 's/^REDIS_PASSWORD=//p' "$root" | head -1 | tr -d '\r' | tr -d "\"'")"

  if [ -z "$pass" ]; then
    if ! command -v openssl >/dev/null; then
      warn "Supreme: липсва openssl — сложи REDIS_PASSWORD ръчно в SupremeDiscordBot/.env"
      return 0
    fi
    pass="$(openssl rand -base64 24 | tr -d '/+=')"
    # Пренасочването стои на СЪЩИЯ ред като printf — тайната отива във файла,
    # никога в stdout. Така е видимо и за човек, и за deploy-check.mjs, който
    # различава запис от лог точно по това.
    printf '\n# v40 — авто-генерирана от autodeploy.sh (Redis --requirepass).\nREDIS_PASSWORD=%s\n' "$pass" >> "$root"
    chmod 600 "$root"
    ok "Supreme: генерирах REDIS_PASSWORD в SupremeDiscordBot/.env (mode 600)."
  fi

  # REDIS_URL в backend/.env и bot/.env — само ако още е БЕЗ парола.
  local f
  for f in backend/.env bot/.env; do
    [ -f "$d/$f" ] || continue
    if grep -qE '^REDIS_URL=.*//:[^@]+@' "$d/$f"; then
      continue                                   # вече носи парола — не пипаме
    fi
    if grep -qE '^REDIS_URL=' "$d/$f"; then
      # Вмъкваме „:<парола>@“ веднага след схемата; хостът и портът остават.
      sed -i "s|^\(REDIS_URL=\"\?\)redis://|\1redis://:${pass}@|" "$d/$f"
      ok "Supreme: изравних REDIS_URL в $f."
    else
      printf '\nREDIS_URL="redis://:%s@redis:6379"\n' "$pass" >> "$d/$f"
      ok "Supreme: добавих REDIS_URL в $f."
    fi
    chmod 600 "$d/$f"
  done
}

# Бекъп на базата на Supreme Bot ПРЕДИ миграциите.
# Връща 0 и когато базата още не съществува (пръв деплой — няма какво да губим);
# връща 1 само когато базата ВЪРВИ, но дъмпът се проваля → деплоят спира.
supreme_pre_deploy_dump() {
  local pg="supremebot_postgres"
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$pg"; then
    log "Supreme: няма работеща база (пръв деплой?) — прескачам дъмпа преди миграция."
    return 0
  fi
  local user db out
  user="$(docker exec "$pg" printenv POSTGRES_USER 2>/dev/null | tr -d '\r' || true)"; user="${user:-bot}"
  db="$(docker exec "$pg" printenv POSTGRES_DB 2>/dev/null | tr -d '\r' || true)";     db="${db:-discordbot}"
  mkdir -p "$SUPREME_BACKUP_DIR"; chmod 700 "$SUPREME_BACKUP_DIR"
  out="$SUPREME_BACKUP_DIR/pre-deploy-$TS.dump"
  ( umask 077
    docker exec "$pg" pg_dump -Fc --no-owner --no-acl -U "$user" "$db" > "$out" ) || {
    rm -f "$out"
    warn "Supreme: pg_dump преди миграция се провали — НЕ деплойвам без застраховка."
    return 1
  }
  local size; size="$(stat -c '%s' "$out" 2>/dev/null || echo 0)"
  if [ "$size" -lt 1024 ]; then
    rm -f "$out"
    warn "Supreme: дъмпът преди миграция е само ${size}B — приемам го за провален, спирам деплоя."
    return 1
  fi
  ok "Supreme: снимка на базата преди миграция: $out ($(du -h "$out" | awk '{print $1}'))"
  # Пазим последните 5 pre-deploy снимки (дневните криптирани бекъпи са отделно).
  ls -1t "$SUPREME_BACKUP_DIR"/pre-deploy-*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f || true
  return 0
}

# Самоинсталиране на дневния криптиран бекъп (DPA §5.1). Идемпотентно: пуска се
# при всеки успешен деплой, обновява скрипта и единиците, вдига таймера веднъж.
supreme_install_backup_timer() {
  local d="$1"
  command -v systemctl >/dev/null || { warn "Supreme: няма systemd — бекъп таймерът не е инсталиран."; return 0; }
  [ -f "$d/deploy/backup-postgres.sh" ] || { warn "Supreme: липсва deploy/backup-postgres.sh в архива — бекъпът НЕ е инсталиран."; return 0; }
  install -m 700 "$d/deploy/backup-postgres.sh"  /usr/local/sbin/supreme-backup-postgres
  install -m 700 "$d/deploy/restore-postgres.sh" /usr/local/sbin/supreme-restore-postgres
  install -m 644 "$d/deploy/supreme-backup.service" /etc/systemd/system/supreme-backup.service
  install -m 644 "$d/deploy/supreme-backup.timer"   /etc/systemd/system/supreme-backup.timer
  mkdir -p "$SUPREME_BACKUP_DIR"; chmod 700 "$SUPREME_BACKUP_DIR"
  systemctl daemon-reload
  systemctl enable --now supreme-backup.timer >/dev/null 2>&1 \
    && ok "Supreme: дневен криптиран бекъп активен (supreme-backup.timer, 03:00 UTC)." \
    || warn "Supreme: не успях да вдигна supreme-backup.timer — виж systemctl status."
  if [ ! -s /root/.supreme-backup-pass ]; then
    warn "Supreme: ЛИПСВА /root/.supreme-backup-pass — бекъпите ще се провалят до създаването ѝ:"
    warn "  umask 077; openssl rand -base64 48 > /root/.supreme-backup-pass; chmod 600 /root/.supreme-backup-pass"
    warn "  (запази паролата И извън сървъра — без нея бекъпите не се отварят). Виж SupremeDiscordBot/deploy/BACKUP.md"
  fi
}

# ── Health check ──────────────────────────────────────────────────────────────
# ── 3g) eternaltouch — Docker Compose ─────────────────────────────────────────
deploy_eternaltouch() {
  local d="$SRC/eternaltouch"
  [ -d "$d" ] || { warn "Няма eternaltouch/ в архива — пропускам."; return; }
  log "Разгръщам eternaltouch (Docker Compose)…"
  # Пренеси съществуващия .env (тайните живеят на сървъра, не в архива).
  carry_env eternaltouch "$d"
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
# Register.it представя *.securemail.pro / smtp.webnode.com cert на
# authsmtp.register.it (не за connect хоста) — задай servername, за да остане
# TLS валидацията вкл. (rejectUnauthorized). Без този ред първото пращане след
# попълване на SMTP_PASS гърми с cert-mismatch. Стойността е от .env.example.
SMTP_TLS_SERVERNAME=smtp.webnode.com
EOF
    chmod 600 "$d/.env"
    warn "Записах eternaltouch/.env. Админ парола: ${adp} — запиши я в password manager СЕГА."
    warn "Попълни SMTP_PASS в eternaltouch/.env, за да тръгнат имейлите."
  fi
  chmod 600 "$d/.env" 2>/dev/null || true
  carry_env eternaltouch "$d"   # новогенерираният .env → стабилния път
  ( cd "$d" && bash deploy.sh ) \
    || { warn "eternaltouch: deploy.sh се провали — продължавам с останалите."; deploy_failed=1; return; }
  health "$ET_HEALTH_URL" "eternaltouch" || deploy_failed=1
}

# ── 3з) piuma — Docker Compose (app + worker + db + redis + вътрешен nginx) ───
deploy_piuma() {
  local d="$SRC/piuma"
  [ -d "$d" ] || { warn "Няма piuma/ в архива — пропускам."; return; }
  log "Разгръщам piuma (Docker Compose)…"
  command -v docker >/dev/null || die "Липсва docker — инсталирай Docker Engine + compose plugin."

  # Тайните живеят на СЪРВЪРА, не в архива. Ред: споделеният път (каноничен, оцелява
  # всичко), после текущият release (за инсталация отпреди споделения път).
  if [ ! -f "$d/.env" ]; then
    if [ -f "$PIUMA_ENV" ]; then
      cp -a "$PIUMA_ENV" "$d/.env"; ok "Пренесох piuma/.env от $PIUMA_ENV"
    elif [ -f "$CURRENT_LINK/piuma/.env" ]; then
      cp -a "$CURRENT_LINK/piuma/.env" "$d/.env"; ok "Пренесох piuma/.env от текущия release"
    fi
  fi
  # За разлика от eternaltouch тук НЕ генерираме .env с случайни тайни. Piuma не може
  # да работи с измислени IG_APP_ID/IG_APP_SECRET/IG_REDIRECT_URI — те идват от
  # конзолата на Meta и няма как да се отгатнат. Полу-вдигнат панел, който държи
  # токени, е по-лош изход от ясен отказ. Виж piuma/DEPLOY.md.
  # Липсващ .env значи „този продукт още не е настроен на ТАЗИ машина" — пропускаме го
  # като неразгърнат, не го обявяваме за провал: иначе добавянето на piuma в списъка по
  # подразбиране би счупило `current` на всеки сървър, където още няма тайни.
  if [ ! -f "$d/.env" ]; then
    warn "Няма piuma/.env — пропускам piuma (не измислям тайни)."
    warn "  Направи го веднъж по piuma/DEPLOY.md: install -m 600 … $PIUMA_ENV, после пусни скрипта пак."
    return
  fi
  chmod 600 "$d/.env" 2>/dev/null || true

  # Бекъп ПРЕДИ миграцията, щом базата вече върви (при пръв деплой няма какво). Стабилен
  # път извън releases/ — до .env-а; пази последните 5. Провал на дъмпа спира piuma:
  # миграция без бекъп е връщане назад без път назад.
  local bk; bk="$(dirname "$PIUMA_ENV")/backups"
  if [ -n "$( cd "$d" && docker compose ps -q db 2>/dev/null )" ]; then
    mkdir -p "$bk"; chmod 700 "$bk"
    if ( cd "$d" && docker compose exec -T db pg_dump -U piuma piuma | gzip > "$bk/pre-deploy-$TS.sql.gz" ); then
      ok "piuma: бекъп преди миграция → $bk/pre-deploy-$TS.sql.gz ($(du -h "$bk/pre-deploy-$TS.sql.gz" | cut -f1))"
      ls -t "$bk"/pre-deploy-*.sql.gz | tail -n +6 | xargs -r rm -f
    else
      rm -f "$bk/pre-deploy-$TS.sql.gz"
      warn "piuma: бекъпът преди миграция се провали — не мигрирам без бекъп, пропускам piuma."
      deploy_failed=1; return
    fi
  else
    log "piuma: базата още не върви (пръв деплой) — няма какво да се бекъпва."
  fi

  # `( … ) || { … return; }` НЕ е украса — скриптът върви под `set -euo pipefail` и
  # ненулев изход тук би убил ЦЕЛИЯ autodeploy, оставяйки следващите проекти неразгърнати.
  ( cd "$d"
    docker compose build
    # Миграциите се прилагат от entrypoint-а (`prisma migrate deploy`, никога `db push`),
    # затова тук няма отделна стъпка — app и worker тръгват само върху мигрирана схема.
    docker compose up -d --remove-orphans
  ) || { warn "piuma: docker compose се провали — старите контейнери остават както са."; deploy_failed=1; return; }

  # Портът се чете от .env, освен ако PIUMA_HEALTH_URL не е зададен изрично.
  local url="$PIUMA_HEALTH_URL"
  if [ -z "${PIUMA_HEALTH_URL_SET:-}" ]; then
    # `|| true` НЕ е украса: без реда HTTP_PORT grep връща 1, `pipefail` го изнася от
    # тръбата и `set -e` убива целия autodeploy точно СЛЕД `compose up` — без health, без
    # проверка на работника, без преместване на `current`, без следващите проекти.
    local p; p="$(grep -E '^HTTP_PORT=' "$d/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -dc '0-9' || true)"
    [ -n "$p" ] && url="http://127.0.0.1:${p}/health"
  fi
  health "$url" "piuma" || deploy_failed=1

  # Работникът е ОТДЕЛЕН процес: панелът може да е напълно жив, докато публикуването,
  # подновяването на токени, Insights и автопилотът са мъртви. Без тази проверка
  # провалът е невидим до мига, в който одобрен пост просто не излиза.
  # `ps -q` + `docker inspect`, не `ps --format '{{.State}}'`: Go шаблон във `--format` на
  # `compose ps` има едва от Compose v2.21 — по-стар плъгин на сървъра би дал грешка, която
  # тук се чете като „работникът не тича“.
  local worker_id worker_state
  worker_id="$( cd "$d" && docker compose ps -q worker 2>/dev/null | head -1 )" || worker_id=""
  worker_state="$( [ -n "$worker_id" ] && docker inspect -f '{{.State.Status}}' "$worker_id" 2>/dev/null )" || worker_state=""
  if [ "$worker_state" = "running" ]; then
    ok "piuma: работникът тича (публикуване · токени · Insights · автопилот)."
  else
    warn "piuma: работникът НЕ тича (състояние: ${worker_state:-няма}) — одобрените постове няма да излязат."
    warn "  Виж: cd $d && docker compose logs worker"
    deploy_failed=1
  fi

  # Пръв деплой: няма нито един потребител, тоест панелът не може да се отвори.
  # Собственикът НЕ се създава автоматично — паролата е работа на човек, не на скрипт.
  local users
  users="$( cd "$d" && docker compose exec -T db psql -U piuma -d piuma -tAc 'SELECT count(*) FROM "User"' 2>/dev/null | tr -dc '0-9' )" || users=""
  if [ "$users" = "0" ]; then
    warn "piuma: няма нито един потребител — създай собственика веднъж:"
    warn "  cd $d && docker compose exec app npm run owner:create"
  fi
}

# ── 3и) vps-dashboard — systemd (Node, нула runtime зависимости) ──────────────
# Панелът обслужва себе си (public/ статика + src/ API). Деплоят е rsync на кода +
# рестарт. Конфигът (/etc/vps-dashboard/config.json) и state (/var/lib/vps-dashboard)
# се ИЗКЛЮЧВАТ — живеят извън release-а и оцеляват. Ако конфигът липсва (пръв деплой),
# услугата няма да тръгне: пусни веднъж deploy/install.sh за да го създаде. Health +
# rollback като medqr/mastilko. is-active 401 брои за „жив" (ping иска сесия).
deploy_vpsdashboard() {
  local d="$SRC/vpsdash"
  [ -d "$d" ] || { warn "Няма vpsdash/ в архива — пропускам."; return; }
  log "Разгръщам vps-dashboard (systemd, Node, нула зависимости)…"
  command -v node >/dev/null || die "Липсва node — инсталирай Node.js ≥ 20."
  command -v rsync >/dev/null || { apt-get update -y && apt-get install -y rsync; }

  # Пръв деплой без конфиг: НЕ пускаме услугата да гърми в loop — install.sh я
  # вдига след като създаде тайните. Само разполагаме кода и предупреждаваме.
  if [ ! -f /etc/vps-dashboard/config.json ]; then
    warn "Няма /etc/vps-dashboard/config.json — това е пръв деплой."
    warn "Пусни веднъж: sudo bash $d/deploy/install.sh (създава конфиг + тайни + вдига услугата)."
    ( cd "$d" && bash deploy/install.sh </dev/null ) || warn "install.sh не мина автоматично — пусни го ръчно."
    health "$VPSDASH_HEALTH_URL" "vps-dashboard" \
      || [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$VPSDASH_HEALTH_URL" 2>/dev/null)" = "401" ] \
      || deploy_failed=1
    return
  fi

  # Бекъп на текущия код (конфигът и state са извън тази папка → непокътнати).
  [ -d "$VPSDASH_DIR" ] && cp -a "$VPSDASH_DIR" "${VPSDASH_DIR}.bak-$TS"
  mkdir -p "$VPSDASH_DIR"
  # `deploy/desktop/desktop.env` е ТАЙНА вътре в дървото на кода (живее до compose
  # файла) — `--delete` я трие при всеки деплой и панелът пак иска DESKTOP_PASSWORD.
  # Тихата регресия изглежда като пропусната стъпка от инсталацията.
  rsync -a --delete --exclude .state/ --exclude node_modules/ \
    --exclude deploy/desktop/desktop.env "$d"/ "$VPSDASH_DIR"/
  # systemd unit — самоинсталиращ се/обновяващ се при всеки деплой.
  install -m 644 "$VPSDASH_DIR/deploy/vps-dashboard.service" /etc/systemd/system/${VPSDASH_SERVICE}.service
  systemctl daemon-reload
  systemctl enable "$VPSDASH_SERVICE" >/dev/null 2>&1 || true

  # ── Самодеплой: панелът обновява САМИЯ СЕБЕ СИ ──────────────────────────────
  # Когато този скрипт е пуснат ОТ панела, той върви в cgroup-а на
  # vps-dashboard.service. `systemctl restart` праща SIGTERM на целия cgroup
  # (KillMode=control-group по подразбиране) → скриптът се самоубива тук и НИКОГА
  # не стига до health/rollback, до `current` symlink-а и до чистенето. Затова при
  # самодеплой рестартът се отлага в отделна преходна единица: скриптът довършва
  # цикъла, панелът се вдига след няколко секунди.
  if [ -n "${CSD_SELF_DEPLOY:-}" ] && command -v systemd-run >/dev/null; then
    # Синтактична проверка на новия код ПРЕДИ да рестартираме (евтин предпазител —
    # няма билд стъпка, но счупен файл не бива да сваля панела).
    if ! ( cd "$VPSDASH_DIR" && node --check server.js ); then
      deploy_failed=1
      warn "vps-dashboard: новият код не минава node --check — НЕ рестартирам. Старият панел остава жив."
      return
    fi
    systemd-run --quiet --on-active=5 --unit="csd-selfrestart-$TS" \
      systemctl restart "$VPSDASH_SERVICE" \
      && ok "vps-dashboard: рестартът е отложен с 5s (самодеплой) — панелът ще се вдигне сам." \
      || { deploy_failed=1; warn "vps-dashboard: не успях да отложа рестарта."; }
    return
  fi

  systemctl restart "$VPSDASH_SERVICE"
  sleep 2
  # /api/ping без сесия връща 401 → това е „жив". health() приема само 2xx/3xx,
  # затова третираме 401 отделно като успех.
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$VPSDASH_HEALTH_URL" 2>/dev/null || echo 000)"
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then
    ok "vps-dashboard е жив ($VPSDASH_HEALTH_URL → $code)"
    rm -rf "${VPSDASH_DIR}.bak-$TS"
    ls -1dt "${VPSDASH_DIR}".bak-* 2>/dev/null | tail -n +3 | xargs -r rm -rf || true
  else
    deploy_failed=1
    warn "vps-dashboard health провал ($code) — връщам предишния код."
    systemctl stop "$VPSDASH_SERVICE" || true
    if [ -d "${VPSDASH_DIR}.bak-$TS" ]; then
      rsync -a --delete --exclude .state/ "${VPSDASH_DIR}.bak-$TS"/ "$VPSDASH_DIR"/
      systemctl restart "$VPSDASH_SERVICE"
    fi
  fi
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
  # filters.json НЕ е тук: той се публикува ЗАЕДНО с подписа си (стъпка 1а).
  for f in index.html privacy.html robots.txt sitemap.xml llms.txt \
           og.png favicon-48.png apple-touch-icon.png icon-512.png shield-380.webp shield-96.webp popup-shot.webp; do
    [ -f "$d/$f" ] && rsync -a "$d/$f" "$ADBLOCK_WWW"/
  done
  # favicon.svg беше старото лого (заменено с бранд щита) — да не остане да виси.
  rm -f "$ADBLOCK_WWW/favicon.svg"
  # .well-known/ (security.txt и др.)
  if [ -d "$d/.well-known" ]; then
    mkdir -p "$ADBLOCK_WWW/.well-known"
    rsync -a "$d/.well-known/" "$ADBLOCK_WWW/.well-known/"
  fi
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

  # 1а) filters.json + Ed25519 подпис, публикувани като ДВОЙКА.
  # Разширението (Chrome 137+) ИЗИСКВА валиден подпис: липсващ .sig → „no
  # signature", стар .sig към нов filters.json → „bad signature" — и в двата случая
  # всички live ъпдейти се отхвърлят, включително аварийният стоп
  # (disableRequestFlags). Затова: подписваме в staging и публикуваме двойката
  # чак след успешен подпис; без ключ или при провал СТАРАТА (съвпадаща) двойка
  # остава на място. Ключът живее САМО на сървъра (adblock/server/README.md).
  if [ -f "$d/filters.json" ]; then
    local stage; stage="$(mktemp -d)"
    cp "$d/filters.json" "$stage/filters.json"
    if [ -f "$ADBLOCK_SIGNING_KEY" ] \
       && openssl pkeyutl -sign -inkey "$ADBLOCK_SIGNING_KEY" -rawin -in "$stage/filters.json" 2>/dev/null \
            | base64 -w0 > "$stage/filters.json.sig" \
       && [ -s "$stage/filters.json.sig" ]; then
      install -m 644 "$stage/filters.json.sig" "$ADBLOCK_WWW/filters.json.sig.new"
      install -m 644 "$stage/filters.json" "$ADBLOCK_WWW/filters.json.new"
      mv -f "$ADBLOCK_WWW/filters.json.new" "$ADBLOCK_WWW/filters.json"
      mv -f "$ADBLOCK_WWW/filters.json.sig.new" "$ADBLOCK_WWW/filters.json.sig"
      if id caddy >/dev/null 2>&1; then chown caddy:caddy "$ADBLOCK_WWW/filters.json" "$ADBLOCK_WWW/filters.json.sig"; fi
      ok "adblock: filters.json + filters.json.sig публикувани като подписана двойка"
    elif [ -f "$ADBLOCK_WWW/filters.json" ] && [ -f "$ADBLOCK_WWW/filters.json.sig" ]; then
      warn "adblock: НЯМА подпис (ключ: $ADBLOCK_SIGNING_KEY) — оставям предишната подписана двойка filters.json/.sig; новият filters.json НЕ е публикуван."
      deploy_failed=1
    else
      install -m 644 "$stage/filters.json" "$ADBLOCK_WWW/filters.json"
      rm -f "$ADBLOCK_WWW/filters.json.sig"
      warn "adblock: НЯМА ключ за подпис ($ADBLOCK_SIGNING_KEY) — filters.json е публикуван НЕПОДПИСАН; Chrome 137+ ще отхвърля live ъпдейтите, докато не сложиш ключа и не деплойнеш пак."
      deploy_failed=1
    fi
    rm -rf "$stage"
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

# Проверка за живот. Трети аргумент (по избор) е низ, който ТРЯБВА да се среща в
# отговора — иначе „200" доказва само, че нещо слуша на този порт, а на споделена
# машина това може да е съвсем друго приложение (реален случай: ERP на 3100 даваше
# зелено за vizitka и rollback-ът никога не се задействаше).
health() {
  local url="$1" name="$2" expect="${3:-}" i out code body diag=""
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if out="$(curl -fsS --max-time 5 -w '\n%{http_code}' "$url" 2>/dev/null)"; then
      code="${out##*$'\n'}"
      body="${out%$'\n'*}"
      if [ -z "$expect" ]; then ok "$name е жив ($url)"; return 0; fi
      case "$code" in
        2*)
          if printf '%s' "$body" | grep -q "$expect"; then ok "$name е жив ($url)"; return 0; fi
          diag="код $code без маркера „$expect“ — на порта отговаря ДРУГО приложение"
          ;;
        *)
          # Реален инцидент: приложението пренасочваше /healthz с 308 към https
          # (prod middleware пред маршрута), а `curl` без `-L` брои 3xx за успех.
          # Тялото е „Moved Permanently…“, маркера го няма → гейтът обявяваше
          # живото приложение за чуждо. 3xx НЕ е доказателство за живот.
          diag="код $code (пренасочване) — сондата не стига до самото приложение"
          ;;
      esac
    else
      diag=""
    fi
    sleep 3
  done
  # Присъдата е по КРАЯ на цикъла, не по първия отговор: докато новият процес
  # вдига, порта го държи старият код (той маркера няма) — падането на първия
  # мисматч обявяваше успешен деплой за провален.
  if [ -n "$diag" ]; then warn "$name: $diag ($url)"; else warn "$name НЕ отговаря на $url"; fi
  return 1
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

# Преди КОЙТО И ДА Е проект: огледай тайните на Supreme от `current` в shared.
# Този пробег може да е за друг продукт и след малко да премести `current` —
# редакция, направена в текущия release, не бива да остане назад в стар release.
# `|| true`: съхраняването на тайни никога не проваля деплой на друг продукт.
supreme_persist_env "$CURRENT_LINK/SupremeDiscordBot" || true

for p in $PROJECTS; do
  case "$p" in
    zabobovdol) deploy_zabobovdol ;;
    medqr)      deploy_medqr ;;
    vizitka)    deploy_vizitka ;;
    panev)      deploy_panev ;;
    ospedali)   deploy_ospedali ;;
    nexus)      deploy_nexus ;;
    mastilko)   deploy_mastilko ;;
    SupremeDiscordBot)    deploy_supreme ;;
    eternaltouch)         deploy_eternaltouch ;;
    piuma)      deploy_piuma ;;
    adblock)    deploy_adblock ;;
    vpsdash|vps-dashboard|vpsdashboard) deploy_vpsdashboard ;;
    *)          warn "Непознат проект: $p" ;;
  esac
done

# ── 4) Маркирай текущия release + почисти старите ─────────────────────────────
# Само УСПЕШЕН пробег става `current`.
#
# Дотук symlink-ът се вдигаше безусловно: провалил се деплой пак ставаше
# „текущият", тоест следващият откат сочеше към счупеното, а човек, който гледа
# `current`, вижда версия, която никога не е тръгнала. (VPS-аджията, 07.08.2026)
if [ "$deploy_failed" = "0" ]; then
  ln -sfn "$SRC" "$CURRENT_LINK"
  ok "current → $SRC"
else
  warn "current НЕ е преместен — $SRC се разгърна с грешки."
  warn "Текущ: $(readlink -f "$CURRENT_LINK" 2>/dev/null || echo '(няма)')"
fi
# Пази последните KEEP_RELEASES, НО никога не трий този, който току-що разгърнахме
# (при rollback към стар release той може да е извън най-новите — иначе си трием
# кода изпод краката, точно докато current сочи натам).
# Пази ДВЕ неща, не едно: това, което току-що разгърнахме ($SRC), И това, което
# `current` реално сочи. При провал те се разминават — symlink-ът остава на
# стария release, а той може да е достатъчно назад, за да попадне под ножа. Тогава
# щяхме да изтрием кода, който в момента обслужва продукцията.
# (VPS-аджията, одит 07.08.2026)
KEEP_REL="$(cd "$SRC" && pwd -P)"
LIVE_REL="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
while read -r old; do
  [ -n "$old" ] || continue
  old_real="$(cd "$old" 2>/dev/null && pwd -P || true)"
  [ -n "$old_real" ] || continue
  keep=0
  for protected in "$KEEP_REL" "$LIVE_REL"; do
    [ -n "$protected" ] || continue
    case "$protected" in
      "$old_real"|"$old_real"/*) keep=1 ;;
    esac
  done
  [ "$keep" = "1" ] && continue
  rm -rf "$old"
done < <(ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)))

if [ "$deploy_failed" = "0" ]; then
  ok "Деплой готов ($TS). Проекти: $PROJECTS"
else
  die "Деплой завърши с грешки — виж изхода по-горе (направен е опит за rollback)."
fi
