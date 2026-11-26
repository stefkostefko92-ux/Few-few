#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fetch-deploy.sh — сваля кода направо от GitHub и подава на autodeploy.sh.
#
# Същият деплой като ръчния, само без ръчното качване: репото е публично, значи
# сървърът може да си вземе архива сам. НЕ прави `git pull` на машината — няма
# работно дърво, няма история, няма `.git` за поддържане; сваля се неизменяем
# архив за точен ref, точно както се качваше ZIP-ът.
#
# Употреба:
#   sudo bash deploy/fetch-deploy.sh                      # main
#   sudo REF=v1.4.0 bash deploy/fetch-deploy.sh           # таг
#   sudo REF=claude/<клон> bash deploy/fetch-deploy.sh    # клон (и със / в името)
#   sudo REF=09597af… bash deploy/fetch-deploy.sh         # точен комит
#   sudo PROJECTS="piuma" bash deploy/fetch-deploy.sh     # само един продукт
#
# Всички променливи на autodeploy.sh (PROJECTS, FORCE_SEED, KEEP_RELEASES…) важат
# и тук — подават се както обикновено и стигат до него през средата.
#
# Идемпотентен: безопасно е да се пуска многократно.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${REPO:-stefkostefko92-ux/Few-few}"
REF="${REF:-main}"
ARCHIVE_DIR="${ARCHIVE_DIR:-/root}"
# Колко свалени архива да се пазят. Всеки е ~250 MB — без това чистене дискът
# свършва мълчаливо и първият симптом е провалил се билд, не „няма място".
KEEP_ARCHIVES="${KEEP_ARCHIVES:-2}"

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()  { printf '\033[32m✔ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

# REF влиза в URL-а и в името на файла → само безопасни символи, без `..` (обхождане
# на пътя в codeload URL-а) и без водещо `-` (би се чело като опция). Иначе — отказ,
# преди каквато и да е мрежа или запис. (VPS-аджията, одит 25.09.2026 — H4)
validate_ref() {
  # LC_ALL=C: в UTF-8 локал диапазонът A-Z може да хване и букви извън ASCII.
  local r="$1" LC_ALL=C
  [[ "$r" =~ ^[A-Za-z0-9._/-]{1,200}$ ]] || return 1
  [[ "$r" != *..* ]] || return 1
  [[ "$r" != -* ]] || return 1
  return 0
}
validate_ref "$REF" || die "Невалиден REF — позволени са само A-Z a-z 0-9 . _ / - (до 200 знака), без „..“ и без водещо „-“."

# ── Пазач на ref-а по продукт (fail-closed) ──────────────────────────────────
# Урок 2026-11-15: zabobovdol вървеше от неслят клон, а деплой с REF=main по
# подразбиране върна стария сайт — не за първи път. Правилото „провери къде е кодът“
# беше само текст. Сега сървърът помни от кой ref е разгърнат всеки продукт и друг
# ref за същия продукт спира ПРЕДИ свалянето. Смяната е съзнателна: ALLOW_REF_SWITCH=1.
# Без PROJECTS (деплой на всички) се проверяват всички запомнени продукти.
# Тест: tools/vps/fetch-deploy-refguard.test.mjs.
REF_STATE_DIR="${REF_STATE_DIR:-/opt/few-few/shared/deploy-refs}"

ref_key() {
  # Едно име за всичките псевдоними в autodeploy.sh; само безопасни знаци (името е файл).
  local k
  k="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"
  case "$k" in
    aso) k=gaming ;;
    vps-dashboard|vpsdashboard) k=vpsdash ;;
  esac
  printf '%s' "$k" | tr -c 'a-z0-9._-' '_'
}

ref_guard_check() {
  [ "${ALLOW_REF_SWITCH:-0}" = "1" ] && return 0
  local names p k f prev when clash=""
  if [ -n "${PROJECTS:-}" ]; then names="$PROJECTS"
  else names="$(ls -1 "$REF_STATE_DIR" 2>/dev/null || true)"; fi
  for p in $names; do
    k="$(ref_key "$p")"; f="$REF_STATE_DIR/$k"
    [ -f "$f" ] || continue
    read -r prev when < "$f" || true
    if [ -n "${prev:-}" ] && [ "$prev" != "$REF" ]; then
      clash="${clash}  ${k}: последно разгърнат от „${prev}“ (${when:-?})"$'\n'
    fi
  done
  [ -z "$clash" ] && return 0
  printf '\033[31m✘ REF=%s би сменил ref-а на продукт, разгърнат от друг ref:\033[0m\n%s' "$REF" "$clash" >&2
  printf '  Слей онзи клон в main (препоръчано) или подай REF=<онзи ref>.\n' >&2
  printf '  Клонът вече е слят в REF, или наистина искаш смяната: ALLOW_REF_SWITCH=1 веднъж (записът се обновява след успешен деплой).\n' >&2
  exit 1
}

ref_skipped() {
  # $1 = продукт. autodeploy.sh го е ПРОПУСНАЛ (условие за обновяване не е изпълнено, работи предишният
  # му код) → записът „разгърнат от REF“ би лъгал пазача (преглед на PR #492).
  local s
  { [ -n "${SKIPPED_FILE:-}" ] && [ -f "$SKIPPED_FILE" ]; } || return 1
  while IFS= read -r s; do
    [ -n "$s" ] && [ "$(ref_key "$s")" = "$(ref_key "$1")" ] && return 0
  done < "$SKIPPED_FILE"
  return 1
}

ref_guard_record() {
  # $1 = autodeploy.sh от архива — оттам е списъкът по подразбиране, когато няма PROJECTS.
  local names p
  if [ -n "${PROJECTS:-}" ]; then names="$PROJECTS"
  else names="$(sed -n 's/^PROJECTS="\${PROJECTS:-\(.*\)}"$/\1/p' "$1" | head -1)"; fi
  install -d -m 700 "$REF_STATE_DIR"
  for p in $names; do
    if ref_skipped "$p"; then continue; fi
    printf '%s %s\n' "$REF" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$REF_STATE_DIR/$(ref_key "$p")"
  done
}

ref_guard_check

[ "$(id -u)" = "0" ] || die "Пусни като root (sudo)."
command -v curl >/dev/null || die "Липсва curl."
command -v tar  >/dev/null || die "Липсва tar."

TS="$(date +%Y%m%d-%H%M%S)"
# „/" в името на клон не бива да става път: чистим до безопасен етикет за файла.
SAFE_REF="$(printf '%s' "$REF" | tr -c 'A-Za-z0-9._-' '-')"
ARCHIVE_PATH="$ARCHIVE_DIR/few-few-${SAFE_REF}-${TS}.tar.gz"

# codeload приема клон, таг И пълен SHA на едно и също място, включително клон със
# „/" в името — затова е един URL, а не познаване на вида на ref-а.
URL="https://codeload.github.com/${REPO}/tar.gz/${REF}"

log "Свалям ${REPO}@${REF}…"
curl -fsSL --retry 4 --retry-delay 2 --retry-connrefused --max-time 900 \
     "$URL" -o "$ARCHIVE_PATH" \
  || die "Свалянето на ${REPO}@${REF} падна. Провери името на ref-а, мрежата и че репото е публично."
chmod 600 "$ARCHIVE_PATH"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Архивът трябва да е НАШЕТО репо, преди да пуснем скрипт от него като root.
# Съдържанието се изброява ВЕДНЪЖ във файл, не се подава на `grep -q` по тръба:
# `grep -q` затваря тръбата при първото съвпадение, `tar` получава SIGPIPE и под
# `pipefail` успешната проверка се чете като провал. (Уловено при тест, не на око.)
tar -tzf "$ARCHIVE_PATH" > "$WORK/listing.txt" 2>/dev/null \
  || die "Архивът е повреден (tar не го чете)."
grep -qE '^[^/]+/deploy/autodeploy\.sh$' "$WORK/listing.txt" \
  || die "Архивът не прилича на това репо (липсва deploy/autodeploy.sh)."
ok "Свален: $ARCHIVE_PATH ($(du -h "$ARCHIVE_PATH" | cut -f1))"

# autodeploy.sh спира без <архив>.sha256 (fail-closed). GitHub не публикува хеш на
# codeload архивите, затова го пишем веднага след свалянето по TLS: пази файла от
# повреда/подмяна между свалянето и разопаковането, не доказва произхода сам по себе
# си — произходът е TLS към codeload + проверката по-горе, че е нашето репо.
( cd "$ARCHIVE_DIR" && sha256sum "${ARCHIVE_PATH##*/}" > "${ARCHIVE_PATH##*/}.sha256" )
chmod 600 "$ARCHIVE_PATH.sha256"

# Вадим САМО deploy/ — autodeploy.sh не зависи от собственото си местоположение и
# сам разопакова пълния архив в нов release. Няма смисъл 250 MB да се разпакова два пъти.
tar -xzf "$ARCHIVE_PATH" -C "$WORK" --strip-components=1 --wildcards '*/deploy/*'
[ -f "$WORK/deploy/autodeploy.sh" ] || die "Неочаквана форма на архива — няма deploy/autodeploy.sh."

# Пази последните KEEP_ARCHIVES свалени архива (ръчно качените не се пипат — друго име).
# `find … -printf` вместо `ls -t | tail`: под `pipefail` празен `ls` (код 2) би убил
# скрипта; find с нула съвпадения връща 0.
# Заедно с архива отива и неговият .sha256.
find "$ARCHIVE_DIR" -maxdepth 1 -name 'few-few-*-*.tar.gz' -printf '%T@ %p\n' \
  | sort -rn | tail -n "+$((KEEP_ARCHIVES + 1))" | cut -d' ' -f2- \
  | while IFS= read -r old; do rm -f -- "$old" "$old.sha256"; done

log "Предавам на autodeploy.sh…"
# ARCHIVE е изрично: иначе autodeploy избира „най-новия архив в /root", тоест ръчно
# качен ZIP отпреди месец може да изпревари този, който току-що свалихме.
# Без `exec` — иначе trap-ът не се изпълнява и временната папка остава.
SKIPPED_FILE="$WORK/skipped.txt"; : > "$SKIPPED_FILE"
SKIPPED_FILE="$SKIPPED_FILE" ARCHIVE="$ARCHIVE_PATH" bash "$WORK/deploy/autodeploy.sh"

# Само след успешен autodeploy (set -e: провал спира по-горе) — от кой ref върви всеки продукт.
ref_guard_record "$WORK/deploy/autodeploy.sh"
ok "Запомнено: ${PROJECTS:-всички продукти} ← ${REF} (${REF_STATE_DIR})"
