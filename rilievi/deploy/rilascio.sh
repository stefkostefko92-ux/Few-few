#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/rilascio.sh — деплоят на rilievi от main с ЕДНА команда (собственикът, 28 ноември 2026 —
# „искам да направиш всичко възможно най-автоматизирано за този деплой“).
#
#   curl -fsSL https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/main \
#     | tar -xz -C /root --strip-components=1 --wildcards \
#         '*/rilievi/deploy/*' '*/rilievi/src/versione.ts' '*/deploy/fetch-deploy.sh'
#   sudo bash /root/rilievi/deploy/rilascio.sh
#
# Решава сам това, което досега решаваше човек, и спира само там, където трябва човек:
# 1. MODULI_KEY в .env — ако липсва или не е 64 hex, пита го скрито (moduli-chiave.sh), веднъж; без него — стоп.
# 2. Бекъп преди всичко — backup.sh от последния работещ release (пръв деплой: само бекъпът на самия деплой).
# 3. Пазачът на ref-а (fetch-deploy.sh): rilievi е разгърнат от друг клон → питаме GitHub дали клонът е изцяло в
#    main (compare: behind/identical) → ALLOW_REF_SWITCH=1. Не е слят, GitHub не отговаря, странно име → стоп,
#    нищо не е пипано (иначе бихме върнали нечия неслята работа).
# 4. fetch-deploy.sh с REF=main PROJECTS=rilievi (build, проверка на модулите, бекъп, миграции, health, откат на
#    кода при провал — deploy.sh).
# 5. Проверка: /health на 127.0.0.1:<HTTP_PORT> и че /novita показва версията от src/versione.ts на архива;
#    публичният адрес — само предупреждение.
# 6. Напомняне за копието извън сървъра (RILIEVI_OFFSITE), ако го няма.
# Идемпотентен: пуснат пак, прави същото (ключът вече е там, ref-ът е main).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

REPO="${REPO:-stefkostefko92-ux/Few-few}"
SHARED="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}"
ENV_FILE="$SHARED/.env"
REF_STATE_DIR="${REF_STATE_DIR:-/opt/few-few/shared/deploy-refs}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FETCH_DEPLOY="${FETCH_DEPLOY:-$HERE/../../deploy/fetch-deploy.sh}"
VERSIONE_TS="${VERSIONE_TS:-$HERE/../src/versione.ts}"
GITHUB_API="${GITHUB_API:-https://api.github.com}"
PUBLIC_URL="${RILIEVI_PUBLIC_URL:-https://rilievi.carbonstealth.eu}"

log()  { printf '\033[1;36m▸ rilievi: %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ rilievi: %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! rilievi: %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✘ rilievi: %s\033[0m\n' "$*" >&2; exit 1; }

# Стойността на ред от .env без кавичките (както deploy.sh ги чете).
env_value() {
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

chiave_presente() { env_value MODULI_KEY | grep -Eqx '[0-9a-fA-F]{64}'; }

passo_chiave() {
  [ -f "$ENV_FILE" ] || fail "няма $ENV_FILE — този сървър още не е настроен (rilievi/DEPLOY.md, т. 1)."
  if chiave_presente; then
    ok "MODULI_KEY е в .env."
    return
  fi
  log "MODULI_KEY липсва — постави го (64 знака, не се показва):"
  bash "$HERE/moduli-chiave.sh" || true
  chiave_presente || fail "MODULI_KEY още липсва — нищо не е пипано. Пусни пак, когато имаш ключа."
  ok "MODULI_KEY е записан."
}

passo_backup() {
  local app=""
  [ -f "$SHARED/last-good" ] && app="$(head -n 1 "$SHARED/last-good")"
  if [ -z "$app" ] || [ ! -f "$app/deploy/backup.sh" ]; then
    warn "няма предишен работещ release — бекъпът е само този на самия деплой."
    return
  fi
  log "бекъп преди деплоя…"
  bash "$app/deploy/backup.sh" || fail "бекъпът не мина — деплоят не тръгва без него."
  ok "бекъпът е готов."
}

# Само безопасни знаци, без „..“ и без водещо „-“ (същото правило като в fetch-deploy.sh).
ref_valido() {
  local r="$1" LC_ALL=C
  [[ "$r" =~ ^[A-Za-z0-9._/-]{1,200}$ ]] && [[ "$r" != *..* ]] && [[ "$r" != -* ]]
}

# Изход: в CAMBIO_REF — 1, ако rilievi върви от клон, който вече е изцяло в main.
CAMBIO_REF=0
passo_ref() {
  local f="$REF_STATE_DIR/rilievi" prev="" resto="" risposta
  [ -f "$f" ] && read -r prev resto <"$f" || true
  if [ -z "$prev" ] || [ "$prev" = "main" ]; then
    ok "rilievi върви от main (или за първи път) — ref-ът не се сменя."
    return
  fi
  ref_valido "$prev" || fail "в $f има странен ref — не го пращам никъде. Провери файла на ръка."
  log "rilievi е разгърнат от „$prev“ — питам GitHub дали е слят в main…"
  risposta="$(curl -fsS -m 20 -H 'Accept: application/vnd.github+json' \
    "$GITHUB_API/repos/$REPO/compare/main...$prev")" ||
    fail "GitHub не отговори за „$prev“ — не сменям ref-а на сляпо. Опитай пак след малко."
  if printf '%s' "$risposta" | grep -Eq '"status": *"(behind|identical)"'; then
    CAMBIO_REF=1
    ok "„$prev“ е изцяло в main — сменям на main (ALLOW_REF_SWITCH=1)."
  else
    fail "„$prev“ НЕ е слят в main — деплой от main би върнал работата му. Слей клона или пиши на разработчика."
  fi
}

passo_deploy() {
  [ -f "$FETCH_DEPLOY" ] || fail "няма $FETCH_DEPLOY — свали го с командата в началото на този файл."
  log "деплой на rilievi от main…"
  if [ "$CAMBIO_REF" = 1 ]; then
    ALLOW_REF_SWITCH=1 REF=main PROJECTS=rilievi bash "$FETCH_DEPLOY" ||
      fail "деплоят спря (виж изхода по-горе; при провал кодът се връща сам — rollback). Миграция: rilievi/DEPLOY.md, „Провалена миграция“."
  else
    env -u ALLOW_REF_SWITCH REF=main PROJECTS=rilievi bash "$FETCH_DEPLOY" ||
      fail "деплоят спря (виж изхода по-горе; при провал кодът се връща сам — rollback). Миграция: rilievi/DEPLOY.md, „Провалена миграция“."
  fi
}

passo_verifica() {
  local port versione
  port="$(env_value HTTP_PORT | tr -dc '0-9')"
  port="${port:-4330}"
  curl -fsS -m 10 "http://127.0.0.1:$port/health" | grep -q '"app":"rilievi"' ||
    fail "/health на 127.0.0.1:$port не отговаря като Rilievi. Виж: docker compose logs --tail=80 app"
  ok "/health на 127.0.0.1:$port — наред."
  versione="$(sed -n "s/.*VERSIONE_SOFTWARE = '\([0-9.]*\)'.*/\1/p" "$VERSIONE_TS" 2>/dev/null | head -n 1)"
  if [ -n "$versione" ]; then
    curl -fsS -m 15 "http://127.0.0.1:$port/novita" | grep -q "Versione $versione" ||
      fail "/novita не показва Versione $versione — порталът още е на старата версия."
    ok "версията е $versione."
  else
    warn "не намерих src/versione.ts до скрипта — версията не е проверена."
  fi
  if curl -fsS -m 15 "$PUBLIC_URL/health" | grep -q '"app":"rilievi"'; then
    ok "$PUBLIC_URL/health — наред."
  else
    warn "$PUBLIC_URL/health не отговаря отвън — провери nginx и DNS (порталът на сървъра е жив)."
  fi
}

passo_promemoria() {
  if ! grep -Eq '^RILIEVI_OFFSITE=.+' "$SHARED/backup.env" 2>/dev/null; then
    warn "няма копие извън сървъра: сложи RILIEVI_OFFSITE в $SHARED/backup.env (вторият сървър на netcup в ЕС — DEPLOY.md, т. 6)."
  fi
  log "условията и правилата 2026-11-29 влизат сами в полунощ по Рим; ADMIN подписва с кода по имейл."
}

main() {
  [ "$(id -u)" = "0" ] || [ "${RILIEVI_RILASCIO_NONROOT:-0}" = "1" ] || fail "пусни като root (sudo)."
  command -v curl >/dev/null || fail "липсва curl."
  passo_chiave
  passo_backup
  passo_ref
  passo_deploy
  passo_verifica
  passo_promemoria
  ok "готово."
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
