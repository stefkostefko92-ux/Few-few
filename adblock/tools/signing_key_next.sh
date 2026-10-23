#!/usr/bin/env bash
# Следващият Ed25519 ключ за подписа на filters.json — ротация без „ден X“ (server/README.md).
# Пуска се НА СЪРВЪРА като root, веднъж:  sudo bash adblock/tools/signing_key_next.sh
# Частният ключ остава там (mode 600) — никога в git, в чат или в архива на деплоя. Скриптът
# отпечатва САМО публичния (raw 32 байта, base64): той отива като втори елемент в SIG_PUBKEYS_B64
# в background.js. Повторно пускане не презаписва нищо, само показва същия публичен ключ.
set -euo pipefail

NEXT="${1:-/etc/caddy/adblock-signing.next.key}"
CURRENT="${ADBLOCK_SIGNING_KEY:-/etc/caddy/adblock-signing.key}"

command -v openssl >/dev/null || { echo "няма openssl" >&2; exit 1; }
[ "$NEXT" != "$CURRENT" ] || { echo "следващият ключ не може да е текущият ($CURRENT)" >&2; exit 1; }

umask 077
if [ -e "$NEXT" ]; then
  echo "вече съществува: $NEXT — не го презаписвам" >&2
else
  openssl genpkey -algorithm ed25519 -out "$NEXT"
  echo "създаден: $NEXT" >&2
fi
chmod 600 "$NEXT"

echo "публичен ключ (за SIG_PUBKEYS_B64):" >&2
openssl pkey -in "$NEXT" -pubout -outform DER | tail -c 32 | base64
echo "Направи офлайн копие на $NEXT и на $CURRENT (две места, извън сървъра). Сървърът продължава да подписва с $CURRENT." >&2
