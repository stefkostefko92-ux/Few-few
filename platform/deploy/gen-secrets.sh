#!/usr/bin/env bash
#
# Генератор на продукционни тайни за platform.
#
# Създава (или допълва) platform/.env от .env.example и попълва трите
# КРИПТОГРАФСКИ тайни със силни случайни стойности:
#   AUTH_SECRET    — сесии (≥32 знака; тук 48 байта base64 ≈ 64 знака)
#   ENCRYPTION_KEY — AES-256-GCM за API ключовете на сайтовете (32 байта hex)
#   CRON_TOKEN     — Bearer токен за /api/cron/health и /api/cron/prune
#
# Принципи:
#   • Идемпотентен: НЕ презаписва вече попълнена тайна (за да не обезсили
#     активни сесии/криптирани данни). Пусни с FORCE=1, за да ги регенерираш.
#   • Никакви тайни в репото: пише само в platform/.env (mode 600), който е в
#     .gitignore. Не отпечатва самите стойности на екрана.
#   • POSTGRES_PASSWORD и OWNER_PASSWORD НЕ се пипат автоматично — задай ги ти
#     (силна парола за собственика; виж съобщението накрая).
#
# Употреба:
#   bash platform/deploy/gen-secrets.sh            # попълва липсващите тайни
#   FORCE=1 bash platform/deploy/gen-secrets.sh    # регенерира ги (внимавай!)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"    # platform/
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"
FORCE="${FORCE:-0}"

log() { printf '→ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*" >&2; }

command -v openssl >/dev/null 2>&1 || { warn "Липсва 'openssl'."; exit 1; }
command -v node >/dev/null 2>&1 || { warn "Липсва 'node' (за ENCRYPTION_KEY hex)."; exit 1; }

# --- 1) Осигури .env (копирай от .env.example при първо пускане) ---
if [ ! -f "$ENV_FILE" ]; then
  [ -f "$EXAMPLE_FILE" ] || { warn "Липсва $EXAMPLE_FILE."; exit 1; }
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  log "Създадох $ENV_FILE от .env.example."
fi
chmod 600 "$ENV_FILE"

# --- Помощник: текущата стойност на КЛЮЧ="…" от .env (без кавичките) ---
current_value() {
  local key="$1"
  # Взима последното срещане; маха обгръщащите кавички.
  sed -n "s/^${key}=\"\{0,1\}\(.*\)/\1/p" "$ENV_FILE" | tail -n1 | sed 's/\"$//'
}

# --- Помощник: задай КЛЮЧ="СТОЙНОСТ" идемпотентно (замести реда или добави) ---
set_kv() {
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # Замести целия ред; стойността минава през awk-safe присвояване (не sed,
    # за да не тълкуваме случайни символи в тайната като sed мета-символи).
    awk -v k="$key" -v v="$val" '
      $0 ~ "^" k "=" { print k "=\"" v "\""; next }
      { print }
    ' "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"
    printf '%s="%s"\n' "$key" "$val" >> "$tmp"
  fi
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

# --- Помощник: празна ли е / плейсхолдър ли е стойността? ---
needs_value() {
  local v="$1"
  [ -z "$v" ] && return 0
  case "$v" in
    *ПРОМЕНИ*|*СМЕНИ*|*CHANGE*|*placeholder*|*example*) return 0 ;;
  esac
  return 1
}

# --- Помощник: генерирай тайна само ако липсва (или FORCE=1) ---
ensure_secret() {
  local key="$1" generator="$2" cur
  cur="$(current_value "$key")"
  if [ "$FORCE" = "1" ] || needs_value "$cur"; then
    local val; val="$(eval "$generator")"
    set_kv "$key" "$val"
    if [ "$FORCE" = "1" ] && ! needs_value "$cur"; then
      log "$key — РЕГЕНЕРИРАН (FORCE=1)."
    else
      log "$key — генериран."
    fi
  else
    log "$key — вече е зададен, пропускам (FORCE=1 за смяна)."
  fi
}

# --- 2) Генерирай трите тайни ---
# AUTH_SECRET: 48 байта base64 (кодът иска ≥32 знака).
ensure_secret AUTH_SECRET 'openssl rand -base64 48'
# ENCRYPTION_KEY: точно 32 байта в hex (64 шестнайсетични знака) за AES-256-GCM.
ensure_secret ENCRYPTION_KEY 'node -e "console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))"'
# CRON_TOKEN: URL-safe случаен низ за Bearer заглавието.
ensure_secret CRON_TOKEN 'openssl rand -hex 32'

# --- 3) Напомняния за ръчните тайни (НЕ ги генерираме автоматично) ---
echo
log "Готово. $ENV_FILE е с права 600."
warn "Задай РЪЧНО (не се генерират тук):"
cat <<'EOF'
   • POSTGRES_PASSWORD — силна парола за базата (напр. openssl rand -base64 24).
       Синхронизирай я в DATABASE_URL, ако го ползваш извън compose.
   • OWNER_PASSWORD    — парола на началния собственик (мин. 10 знака; сийдът
       отхвърля слаба/примерна). Ползва се само при първо сийдване.
   • NEXT_PUBLIC_SITE_URL — публичният HTTPS адрес на панела.
   По избор: ANTHROPIC_API_KEY / SMTP_* — виж DEPLOY.md.
EOF
echo
log "Проверка (без да показва тайните):"
for k in AUTH_SECRET ENCRYPTION_KEY CRON_TOKEN; do
  v="$(current_value "$k")"
  if needs_value "$v"; then
    warn "  $k: ЛИПСВА"
  else
    printf '   %s: зададен (%s знака)\n' "$k" "${#v}"
  fi
done
