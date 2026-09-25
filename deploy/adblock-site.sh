#!/usr/bin/env bash
# adblock-site.sh — деплой САМО на adblock.carbonstealth.eu (витрината + filters.json).
#
# Един източник на логиката: делегира на autodeploy.sh с PROJECTS="adblock" — там
# живеят списъкът с обслужваните файлове, подписаната двойка filters.json/.sig,
# vhost-ът с rollback, TLS и health-check. Тук имаше втора реализация, която
# изостана: не копираше новите изображения на landing-а, оставяше стар .sig до нов
# filters.json (разширението отхвърля такава двойка) и не обновяваше съществуващ
# Nginx vhost. Втора реализация дрейфва — затова вече няма такава.
#
# Употреба (като root, от папката deploy/ на репото):
#   sudo bash deploy/adblock-site.sh                             # сваля main от GitHub
#   sudo REF=claude/<клон> bash deploy/adblock-site.sh           # друг ref
#   sudo ARCHIVE=/root/Few-few.zip bash deploy/adblock-site.sh   # ръчно качен архив
#
# Идемпотентен: безопасно е да се пуска многократно. Не пипа други проекти.
set -euo pipefail

die() { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Пусни като root (sudo)."
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$HERE/autodeploy.sh" ] && [ -f "$HERE/fetch-deploy.sh" ] \
  || die "Пусни го от папката deploy/ на репото (тук липсват autodeploy.sh/fetch-deploy.sh): $HERE"

export PROJECTS="adblock"
if [ -n "${ARCHIVE:-}" ]; then
  [ -f "$ARCHIVE" ] || die "Няма такъв архив: $ARCHIVE"
  exec bash "$HERE/autodeploy.sh"
fi
exec bash "$HERE/fetch-deploy.sh"
