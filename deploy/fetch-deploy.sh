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

# Вадим САМО deploy/ — autodeploy.sh не зависи от собственото си местоположение и
# сам разопакова пълния архив в нов release. Няма смисъл 250 MB да се разпакова два пъти.
tar -xzf "$ARCHIVE_PATH" -C "$WORK" --strip-components=1 --wildcards '*/deploy/*'
[ -f "$WORK/deploy/autodeploy.sh" ] || die "Неочаквана форма на архива — няма deploy/autodeploy.sh."

# Пази последните KEEP_ARCHIVES свалени архива (ръчно качените не се пипат — друго име).
# `find … -printf` вместо `ls -t | tail`: под `pipefail` празен `ls` (код 2) би убил
# скрипта; find с нула съвпадения връща 0.
find "$ARCHIVE_DIR" -maxdepth 1 -name 'few-few-*-*.tar.gz' -printf '%T@ %p\n' \
  | sort -rn | tail -n "+$((KEEP_ARCHIVES + 1))" | cut -d' ' -f2- | xargs -r rm -f

log "Предавам на autodeploy.sh…"
# ARCHIVE е изрично: иначе autodeploy избира „най-новия архив в /root", тоест ръчно
# качен ZIP отпреди месец може да изпревари този, който току-що свалихме.
# Без `exec` — иначе trap-ът не се изпълнява и временната папка остава.
ARCHIVE="$ARCHIVE_PATH" bash "$WORK/deploy/autodeploy.sh"
