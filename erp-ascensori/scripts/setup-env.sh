#!/usr/bin/env bash
# Генерира `.env` за продукционна инсталация. Идемпотентен: попълва само
# празните тайни, никога не презаписва вече зададена стойност.
#
#   bash scripts/setup-env.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ESEMPIO=".env.example"
FILE=".env"

[ -f "$ESEMPIO" ] || { echo "✖ Липсва $ESEMPIO"; exit 1; }
command -v openssl >/dev/null || { echo "✖ Нужен е openssl"; exit 1; }

if [ ! -f "$FILE" ]; then
  cp "$ESEMPIO" "$FILE"
  echo "→ Създаден $FILE от $ESEMPIO"
fi
chmod 600 "$FILE"

# Попълва променлива САМО ако е празна (KEY="" или KEY=).
riempi() {
  local chiave="$1" valore="$2"
  if grep -qE "^${chiave}=(\"\")?$" "$FILE"; then
    # `|` като разделител: hex и base64 не го съдържат.
    sed -i "s|^${chiave}=.*|${chiave}=\"${valore}\"|" "$FILE"
    echo "  ✔ ${chiave} — генерирана"
  else
    echo "  = ${chiave} — вече е зададена, не се пипа"
  fi
}

echo "→ Тайни"
riempi SESSION_SECRET  "$(openssl rand -hex 32)"
riempi AUDIT_HMAC_KEY  "$(openssl rand -hex 32)"
riempi HEALTH_TOKEN    "$(openssl rand -hex 16)"
# Bootstrap потребителят на Postgres. Приложението не го ползва — с него се
# създава само приложната роля при първото вдигане (виж deploy/postgres-init/).
riempi POSTGRES_BOOTSTRAP_PASSWORD "$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"

# Паролата на базата влиза на две места и трябва да съвпада.
if grep -q '^POSTGRES_PASSWORD="CAMBIAMI"' "$FILE"; then
  PW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=\"${PW}\"|" "$FILE"
  sed -i "s|erp:CAMBIAMI@|erp:${PW}@|" "$FILE"
  echo "  ✔ POSTGRES_PASSWORD — генерирана и вписана в DATABASE_URL"
else
  echo "  = POSTGRES_PASSWORD — вече е зададена, не се пипа"
fi

# Двата ключа трябва да са различни: единият подписва сесиите, другият —
# доказателствения регистър. Един и същ ключ свързва двете доверия.
S=$(grep '^SESSION_SECRET=' "$FILE" | cut -d'"' -f2)
A=$(grep '^AUDIT_HMAC_KEY=' "$FILE" | cut -d'"' -f2)
if [ "$S" = "$A" ]; then
  echo "✖ SESSION_SECRET и AUDIT_HMAC_KEY са еднакви — приложението няма да тръгне."
  exit 1
fi

# APP_URL Е ФИЗИЧЕСКО РЕШЕНИЕ. От него се раждат QR стикерите, които се лепят
# по асансьорите; примерната стойност значи стотици стикера, водещи наникъде.
# Пазачът в compose (`${APP_URL:?…}`) хваща ЛИПСВАЩА стойност, не грешна.
if grep -q '^APP_URL=https://erp\.azienda\.it[[:space:]]*$' "$FILE"; then
  echo "✖ APP_URL е още примерната стойност (https://erp.azienda.it)."
  echo "  Задай реалния домейн в $FILE, преди да пуснеш — от него се печатат"
  echo "  QR етикетите по уредбите."
  exit 1
fi

echo ""
echo "✔ $FILE е готов (mode 600)."
echo ""
echo "  Задай РЪЧНО, преди да пуснеш:"
echo "    TRUSTED_PROXY_HOPS   1 при един Nginx, 2 зад Cloudflare"
echo "    BACKUP_AGE_RECIPIENT публичен ключ на age за криптиране на бекъпите"
echo ""
echo "  ВАЖНО: AUDIT_HMAC_KEY е доказателственият ключ на регистъра. Копирай го"
echo "  в мениджъра на пароли ИЗВЪН тази машина. Смяната му прави целия"
echo "  досегашен одит непроверим — ротация не е поддържана."
