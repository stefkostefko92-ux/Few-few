#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  ОСТАРЯЛ — не пускай този скрипт.
#
#  До 2026 panev се деплойваше с PM2 в /var/www/panevascensori (стар VPS
#  178.104.77.242, PHP-FPM за contact.php, Stripe количка). Нищо от това вече
#  не е вярно: сайтът е статично генериран (site/build.mjs) + Express, върви
#  като systemd услуга `panev` в /opt/panev, формата е /api/contact (nodemailer),
#  а contact.php/carrello/success ги няма.
#
#  Каноничният път (както за всички продукти в монорепото):
#
#    1) ЕДНОКРАТНО на нов сървър:
#         sudo bash panev/scripts/bootstrap-vps.sh
#       (потребител, /etc/panev/panev.env 600, systemd unit, nginx 301
#        www→non-www, TLS, ufw, дневен бекъп)
#
#    2) ПРИ ВСЕКИ ДЕПЛОЙ — качваш архива от GitHub в /root и:
#         sudo bash /root/few-few-*/deploy/autodeploy.sh
#         sudo PROJECTS="panev" bash /root/few-few-*/deploy/autodeploy.sh   # само panev
#       (rsync без data/, npm ci --omit=dev, снимка на базата, рестарт,
#        health check на /api/health и автоматичен rollback при провал)
#
#  Пълната процедура: panev/DEPLOY.md
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cat >&2 <<'EOF'

  ✘ panev/scripts/deploy.sh е ОСТАРЯЛ (PM2 модел) и не прави нищо.

  Използвай:
    еднократна подготовка:  sudo bash panev/scripts/bootstrap-vps.sh
    деплой на кода:         sudo PROJECTS="panev" bash deploy/autodeploy.sh

  Подробно: panev/DEPLOY.md

EOF
exit 1
