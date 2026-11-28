#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/moduli-chiave.sh — веднъж на сървъра (и при смяна на ключа): MODULI_KEY в .env.
# Модулите на доставчиците са в репото само шифровани (src/ordini/moduli-sigillo.ts); ключът е при
# собственика. Скриптът го пита скрито — не остава в историята на шела и не се печата.
#
#   sudo bash rilievi/deploy/moduli-chiave.sh
#
# Заменя стар MODULI_KEY, другите редове на .env не пипа. После — деплой (той проверява, че ключът отваря
# модулите на новия release, преди да смени контейнерите).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}"
ENV_FILE="$SHARED/.env"

ok()   { printf '\033[32m✔ rilievi: %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✘ rilievi: %s\033[0m\n' "$*" >&2; exit 1; }

main() {
  # RILIEVI_CHIAVE_NONROOT — само за тестовете (временна папка вместо сървъра).
  [ "$(id -u)" = "0" ] || [ "${RILIEVI_CHIAVE_NONROOT:-0}" = "1" ] || fail "пусни като root (sudo)."
  [ -f "$ENV_FILE" ] || fail "няма $ENV_FILE — първо: sudo bash rilievi/deploy/setup-env.sh"
  local key=""
  if [ -t 0 ]; then
    read -rsp 'MODULI_KEY (64 caratteri, non viene mostrata): ' key
    printf '\n'
  else
    IFS= read -r key || true
  fi
  key="$(printf '%s' "$key" | tr -d '[:space:]')"
  printf '%s' "$key" | grep -Eqx '[0-9a-fA-F]{64}' || fail "MODULI_KEY трябва да е 64 hex знака — .env не е пипан."
  # Глобална, не `local`: trap-ът на EXIT я вижда и след излизането от main.
  tmp="$(mktemp "$SHARED/.env.XXXXXX")"
  # При провал (пълен диск, прекъсване) временното копие с тайните не остава; след mv го няма.
  trap 'rm -f "${tmp:-}"' EXIT
  # Без стария ред, после новият; файлът се сменя наведнъж (mv), с права 600.
  { grep -v '^MODULI_KEY=' "$ENV_FILE" || true; printf 'MODULI_KEY=%s\n' "$key"; } >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$ENV_FILE"
  ok "MODULI_KEY е в $ENV_FILE — сега деплой."
}

main "$@"
