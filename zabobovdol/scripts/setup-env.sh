#!/usr/bin/env bash
# Автоматична настройка на .env за продукция: генерира силните тайни
# (AUTH_SECRET, пароли) и age ключ за криптиран бекъп. Безопасно за повторно
# пускане — НЕ презаписва вече зададени тайни (за да не счупи базата/сесиите).
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env"
EXAMPLE=".env.example"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }
ok()   { printf '\033[32m%s\033[0m\n' "$1"; }

if [ ! -f "$ENV_FILE" ]; then
  cp "$EXAMPLE" "$ENV_FILE"
  ok "Създадох $ENV_FILE от $EXAMPLE."
fi

# Текуща стойност на ключ (без кавичките и без инлайн коментар).
get_kv() {
  local line val
  line=$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1)
  [ -z "$line" ] && return 0
  val=${line#*=}
  if [ "${val:0:1}" = '"' ]; then
    val=${val#\"}        # махни началната кавичка
    val=${val%%\"*}      # вземи до следващата кавичка
  else
    val=${val%%#*}       # махни инлайн коментар
    val=$(printf '%s' "$val" | sed 's/[[:space:]]*$//')
  fi
  printf '%s' "$val"
}
# Задава ключ (заменя реда или го добавя). Стойността се слага в кавички.
set_kv() {
  local key="$1" val="$2" esc
  esc=$(printf '%s' "$val" | sed -e 's/[\\&|]/\\&/g')
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=\"${esc}\"|" "$ENV_FILE"
  else
    printf '%s="%s"\n' "$key" "$val" >> "$ENV_FILE"
  fi
}
# Празна ли е стойността или е примерна (placeholder)?
is_placeholder() {
  case "$1" in
    ""|*ПРОМЕНИ*|*СМЕНИ*|*CHANGE*|*changeme*|*example_*) return 0 ;;
    *) return 1 ;;
  esac
}
# Задава ключ САМО ако сегашната стойност е празна/примерна.
set_if_empty() {
  local key="$1" val="$2" cur
  cur=$(get_kv "$key")
  if is_placeholder "$cur"; then
    set_kv "$key" "$val"
    return 0
  fi
  return 1
}

command -v openssl >/dev/null 2>&1 || { warn "Липсва openssl — инсталирайте го (apt install openssl)."; exit 1; }

bold "Настройвам тайните в $ENV_FILE…"

# AUTH_SECRET — дълъг случаен низ за сесиите.
if set_if_empty "AUTH_SECRET" "$(openssl rand -base64 48)"; then
  ok "AUTH_SECRET: генериран."
else
  warn "AUTH_SECRET: вече зададен — оставям го (смяната изважда всички от профила)."
fi

# Парола за базата (само hex, за да е безопасна в URL адреса).
if set_if_empty "POSTGRES_PASSWORD" "$(openssl rand -hex 24)"; then
  ok "POSTGRES_PASSWORD: генериран."
else
  warn "POSTGRES_PASSWORD: вече зададен — оставям го (смяната къса връзката със съществуващата база)."
fi
[ -z "$(get_kv POSTGRES_USER)" ] && set_kv "POSTGRES_USER" "zabobovdol" || true
[ -z "$(get_kv POSTGRES_DB)" ]   && set_kv "POSTGRES_DB" "zabobovdol"   || true

# Парола за първия администратор — генерираме силна и я ПОКАЗВАМЕ веднъж.
ADMIN_SHOWN=""
NEW_ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
if set_if_empty "ADMIN_PASSWORD" "$NEW_ADMIN_PASS"; then
  ADMIN_SHOWN="$NEW_ADMIN_PASS"
  ok "ADMIN_PASSWORD: генериран (вижте по-долу)."
else
  warn "ADMIN_PASSWORD: вече зададен — оставям го."
fi
[ -z "$(get_kv ADMIN_EMAIL)" ] && set_kv "ADMIN_EMAIL" "admin@carbonstealth.eu" || true

# Криптиран бекъп: генерираме age ключ (частен → backup-key.txt офлайн, публичен → .env).
if is_placeholder "$(get_kv AGE_RECIPIENT)"; then
  if command -v age-keygen >/dev/null 2>&1; then
    if [ ! -f "backup-key.txt" ]; then
      age-keygen -o backup-key.txt 2>/dev/null
      chmod 600 backup-key.txt
    fi
    PUB=$(grep -E "^# public key:" backup-key.txt | sed 's/^# public key: //')
    [ -z "$PUB" ] && PUB=$(age-keygen -y backup-key.txt 2>/dev/null || true)
    if [ -n "$PUB" ]; then
      set_kv "AGE_RECIPIENT" "$PUB"
      ok "AGE_RECIPIENT: генериран (частният ключ е в backup-key.txt)."
    fi
  else
    warn "Липсва age — бекъпите няма да са криптирани. Инсталирайте age и пуснете скрипта пак."
    warn "  (Debian/Ubuntu: apt install age   |   после: scripts/setup-env.sh)"
  fi
else
  warn "AGE_RECIPIENT: вече зададен — оставям го."
fi

# Адрес на сайта.
SITE_URL="$(get_kv NEXT_PUBLIC_SITE_URL)"
[ -z "$SITE_URL" ] && set_kv "NEXT_PUBLIC_SITE_URL" "https://zabobovdol.carbonstealth.eu" || true

echo
ok "Готово. Тайните са записани в $ENV_FILE."
echo
if [ -n "$ADMIN_SHOWN" ]; then
  bold "════════════════════════════════════════════════════════"
  bold " ЗАПИШЕТЕ СИ ПАРОЛАТА ЗА АДМИН (показва се само сега):"
  bold "   Имейл:  $(get_kv ADMIN_EMAIL)"
  bold "   Парола: $ADMIN_SHOWN"
  bold "════════════════════════════════════════════════════════"
  echo
fi
if [ -f "backup-key.txt" ]; then
  warn "ВАЖНО: преместете backup-key.txt на сигурно офлайн място (USB/мениджър на пароли)"
  warn "и го изтрийте от сървъра. Без него криптираните бекъпи НЕ могат да се възстановят."
  echo
fi
bold "Следваща стъпка:  ./scripts/deploy.sh"
