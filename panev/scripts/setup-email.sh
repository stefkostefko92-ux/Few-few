#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  PANEV ASCENSORI — задаване/смяна на SMTP паролата (Aruba)
#
#  Формата за контакт (/api/contact) ВИНАГИ записва запитването в базата, но
#  праща имейл само ако SMTP_PASS е зададена. Този скрипт я вписва в
#  /etc/panev/panev.env (mode 600) и рестартира услугата.
#
#  Пусни на VPS-а като root:
#     sudo bash /opt/panev/scripts/setup-email.sh
#
#  Паролата НЕ се показва на екрана и НИКОГА не влиза в репото.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Пусни като root (sudo)." >&2; exit 1; }

ENV_FILE="${PANEV_ENV:-/etc/panev/panev.env}"
SERVICE="${PANEV_SERVICE:-panev}"

[[ -f "$ENV_FILE" ]] || {
  echo "ERR: няма $ENV_FILE — пусни първо: sudo bash panev/scripts/bootstrap-vps.sh" >&2
  exit 1
}

SMTP_USER="$(sed -n 's/^SMTP_USER=//p' "$ENV_FILE" | head -n1)"
SMTP_USER="${SMTP_USER:-info@panevascensori.it}"

echo
echo "  Panev — SMTP парола за $SMTP_USER (същата като за уебмейла на Aruba)."
read -rsp "  SMTP парола: " SMTP_PASS; echo
[[ -n "$SMTP_PASS" ]] || { echo "ERR: празна парола" >&2; exit 1; }

# Пренаписва САМО реда SMTP_PASS — останалите стойности остават непокътнати.
TMP="$(mktemp)"
chmod 600 "$TMP"
grep -v '^SMTP_PASS=' "$ENV_FILE" > "$TMP" || true
printf 'SMTP_PASS=%s\n' "$SMTP_PASS" >> "$TMP"
cat "$TMP" > "$ENV_FILE"          # запазва собственика и правата на оригинала
rm -f "$TMP"
chmod 600 "$ENV_FILE"

systemctl restart "$SERVICE"
sleep 2
if systemctl is-active --quiet "$SERVICE"; then
  echo "  ✔ $SERVICE рестартиран"
else
  echo "  ✘ $SERVICE не тръгна — journalctl -u $SERVICE -n 50" >&2
  exit 1
fi

BASE_URL="$(sed -n 's/^BASE_URL=//p' "$ENV_FILE" | head -n1)"
BASE_URL="${BASE_URL:-https://panevascensori.it}"
cat <<EOF

  ✔ SMTP паролата е записана в $ENV_FILE (mode 600).

  Провери: изпрати запитване от $BASE_URL/contatti
  Логове:  journalctl -u $SERVICE -f   (грешките на mailer-а излизат там)
  Архив:   запитванията се виждат и в $BASE_URL/admin/messaggi.html

EOF
