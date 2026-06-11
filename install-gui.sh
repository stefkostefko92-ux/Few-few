#!/usr/bin/env bash
#
# install-gui.sh — Инсталира XFCE десктоп среда + xRDP на Ubuntu VPS.
#
# След инсталацията се свързваш към VPS-а с Remote Desktop (RDP):
#   - Windows: вграденото приложение "Remote Desktop Connection" (mstsc)
#   - macOS:   "Windows App" (бившият Microsoft Remote Desktop) от App Store
#   - Linux:   Remmina или друг RDP клиент
#
# Употреба (като root или с sudo):
#   sudo bash install-gui.sh
#
# Поддържани версии: Ubuntu 20.04 / 22.04 / 24.04

set -euo pipefail

RDP_PORT=3389

log()  { echo -e "\e[1;32m[+]\e[0m $*"; }
warn() { echo -e "\e[1;33m[!]\e[0m $*"; }
die()  { echo -e "\e[1;31m[x]\e[0m $*" >&2; exit 1; }

# --- Проверки -----------------------------------------------------------

[[ $EUID -eq 0 ]] || die "Стартирай скрипта като root: sudo bash $0"

if [[ -r /etc/os-release ]]; then
    . /etc/os-release
    [[ ${ID:-} == "ubuntu" ]] || warn "Скриптът е тестван само на Ubuntu (засечено: ${ID:-неизвестно}). Продължавам на твоя отговорност."
else
    warn "Не мога да определя дистрибуцията. Продължавам."
fi

# Потребител, с който ще се влиза през RDP (не root).
# По подразбиране: този, който е извикал sudo.
RDP_USER="${SUDO_USER:-}"
if [[ -z "$RDP_USER" || "$RDP_USER" == "root" ]]; then
    read -rp "Въведи потребителско име за RDP вход (ще бъде създадено, ако не съществува): " RDP_USER
    [[ -n "$RDP_USER" ]] || die "Не е въведено потребителско име."
fi

if ! id "$RDP_USER" &>/dev/null; then
    log "Създавам потребител '$RDP_USER'..."
    adduser --gecos "" "$RDP_USER"
    usermod -aG sudo "$RDP_USER"
fi

# --- Инсталация ---------------------------------------------------------

export DEBIAN_FRONTEND=noninteractive

log "Обновявам списъка с пакети..."
apt-get update -y

log "Инсталирам XFCE десктоп среда (това отнема няколко минути)..."
apt-get install -y xfce4 xfce4-goodies xorg dbus-x11 x11-xserver-utils

log "Инсталирам xRDP..."
apt-get install -y xrdp

# xrdp трябва да има достъп до SSL сертификата, за да криптира сесията
adduser xrdp ssl-cert

# --- Конфигурация -------------------------------------------------------

log "Настройвам XFCE като сесия по подразбиране за '$RDP_USER'..."
RDP_HOME=$(getent passwd "$RDP_USER" | cut -d: -f6)
echo "xfce4-session" > "$RDP_HOME/.xsession"
chown "$RDP_USER:$RDP_USER" "$RDP_HOME/.xsession"

# Стартиране на XFCE за всички xrdp сесии (резервен вариант към .xsession)
if ! grep -q "xfce4-session" /etc/xrdp/startwm.sh; then
    sed -i.bak \
        -e 's|^test -x /etc/X11/Xsession.*|#&|' \
        -e 's|^exec /bin/sh /etc/X11/Xsession.*|#&|' \
        /etc/xrdp/startwm.sh
    echo "startxfce4" >> /etc/xrdp/startwm.sh
fi

# Премахва досадния popup "Authentication required to create managed color device"
log "Настройвам polkit правила за RDP сесии..."
cat > /etc/polkit-1/localauthority/50-local.d/45-allow-colord.pkla <<'EOF'
[Allow Colord all Users]
Identity=unix-user:*
Action=org.freedesktop.color-manager.create-device;org.freedesktop.color-manager.create-profile;org.freedesktop.color-manager.delete-device;org.freedesktop.color-manager.delete-profile;org.freedesktop.color-manager.modify-device;org.freedesktop.color-manager.modify-profile
ResultAny=no
ResultInactive=no
ResultActive=yes
EOF

log "Активирам и стартирам xrdp услугата..."
systemctl enable xrdp
systemctl restart xrdp

# --- Firewall -----------------------------------------------------------

if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    log "UFW е активен — отварям порт $RDP_PORT/tcp..."
    ufw allow "$RDP_PORT/tcp" comment "xRDP"
else
    warn "UFW не е активен. Ако ползваш друг firewall (или такъв при доставчика на VPS-а), отвори порт $RDP_PORT/tcp ръчно."
fi

# --- Резултат -----------------------------------------------------------

SERVER_IP=$(hostname -I | awk '{print $1}')

echo
log "Готово! XFCE + xRDP са инсталирани и работят."
echo
echo "  Свържи се през Remote Desktop към:  ${SERVER_IP}:${RDP_PORT}"
echo "  Потребител:                         ${RDP_USER}"
echo "  Парола:                             паролата на ${RDP_USER} в системата"
echo
warn "Съвети за сигурност:"
echo "  - НЕ влизай като root през RDP."
echo "  - Използвай силна парола — порт $RDP_PORT е честа цел на ботове."
echo "  - Още по-добре: затвори порта и ползвай SSH тунел:"
echo "      ssh -L 3389:localhost:3389 ${RDP_USER}@${SERVER_IP}"
echo "    и след това се свържи с RDP към localhost:3389."
echo "  - За автоматична защита от brute-force: sudo apt install fail2ban"
