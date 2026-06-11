#!/usr/bin/env bash
#
# uninstall-gui.sh — Премахва XFCE и xRDP, инсталирани от install-gui.sh.
#
# Употреба:
#   sudo bash uninstall-gui.sh

set -euo pipefail

log()  { echo -e "\e[1;32m[+]\e[0m $*"; }
die()  { echo -e "\e[1;31m[x]\e[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Стартирай скрипта като root: sudo bash $0"

read -rp "Това ще премахне XFCE и xRDP от системата. Продължавам? [y/N] " answer
[[ ${answer,,} == "y" ]] || exit 0

log "Спирам xrdp услугата..."
systemctl disable --now xrdp || true

log "Премахвам пакетите..."
export DEBIAN_FRONTEND=noninteractive
apt-get purge -y xrdp xfce4 xfce4-goodies
apt-get autoremove -y --purge

log "Изчиствам конфигурацията..."
rm -f /etc/polkit-1/localauthority/50-local.d/45-allow-colord.pkla
rm -rf /etc/xrdp

if command -v ufw &>/dev/null; then
    ufw delete allow 3389/tcp 2>/dev/null || true
fi

log "Готово. Десктоп средата и xRDP са премахнати."
