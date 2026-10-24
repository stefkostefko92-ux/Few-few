#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# korpora/deploy/setup-env.sh — еднократно на сървъра, преди първия деплой: папките на Korpora и
# .env с генерирани ключове (DEPLOY.md, т. 1). Пита само за SMTP (Brevo) и CATALOG_KEY; паролата и
# ключовете не се показват и не остават в историята на шела.
#
#   sudo bash korpora/deploy/setup-env.sh
#
# Никога не презаписва съществуващ .env: нов ENC_KEY обезсилва 2FA, нов HMAC_KEY — устройствата,
# резервните кодове и проверката на одитната верига отпреди смяната. Промяна — `sudoedit` на файла.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${KORPORA_SHARED:-/opt/few-few/shared/korpora}"
DOMAIN="${KORPORA_DOMAIN:-korpora.carbonstealth.eu}"
ENV_FILE="$SHARED/.env"

ok()   { printf '\033[32m✔ korpora: %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✘ korpora: %s\033[0m\n' "$*" >&2; exit 1; }

# Стойност, която влиза в .env без кавички: интервал, кавичка, „#“, „$“ или „\“ биха я счупили за compose.
plain() {
  case "$2" in *[[:space:]\'\"\#\$\\]*) fail "$1 съдържа интервал, кавичка, #, \$ или \\ — не влиза в .env без кавички." ;; esac
}

main() {
  [ "$(id -u)" = "0" ] || fail "пусни като root (sudo)."
  command -v openssl >/dev/null 2>&1 || fail "липсва openssl."
  [ ! -e "$ENV_FILE" ] || fail "$ENV_FILE вече съществува — не го пипам (ключовете не бива да се сменят). Промяна: sudoedit $ENV_FILE"

  local smtp_user smtp_pass catalog_key
  read -rp 'Brevo SMTP потребител (login): ' smtp_user
  read -rsp 'Brevo SMTP ключ: ' smtp_pass && echo
  read -rsp 'CATALOG_KEY (празно — без каталога от магазините): ' catalog_key && echo
  if [ -z "$smtp_user" ] || [ -z "$smtp_pass" ]; then
    fail "SMTP потребителят и ключът са задължителни — без тях писмата не тръгват."
  fi
  plain SMTP_USER "$smtp_user"
  plain SMTP_PASS "$smtp_pass"
  if [ -n "$catalog_key" ] && ! printf '%s' "$catalog_key" | grep -Eqx '[0-9a-fA-F]{64}'; then
    fail "CATALOG_KEY трябва да е 64 hex знака — както е във файла с ключа."
  fi

  install -d -m 700 "$SHARED" "$SHARED/backups"
  # data/ е единствената папка, в която приложението пише — за node (uid 1000) в контейнера
  install -d -m 700 -o 1000 -g 1000 "$SHARED/data"

  local tmp
  tmp="$(mktemp "$SHARED/.env.XXXXXX")"
  {
    printf 'PUBLIC_BASE_URL=https://%s\n' "$DOMAIN"
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'ENC_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'HMAC_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'SMTP_HOST=smtp-relay.brevo.com\nSMTP_PORT=2525\n'
    printf 'SMTP_USER=%s\nSMTP_PASS=%s\n' "$smtp_user" "$smtp_pass"
    printf 'MAIL_FROM=Korpora <no-reply@carbonstealth.eu>\n'
    printf 'CONTACT_EMAIL=info@carbonstealth.eu\nPRIVACY_EMAIL=privacy@carbonstealth.eu\n'
    printf 'KORPORA_DATA=%s/data\n' "$SHARED"
    if [ -n "$catalog_key" ]; then printf 'CATALOG_KEY=%s\n' "$catalog_key"; fi
  } >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$ENV_FILE"
  ok "$ENV_FILE е готов (600): ключовете са генерирани, база и тайни — само тук."
  [ -n "$catalog_key" ] || ok "без CATALOG_KEY Korpora тръгва с основния каталог; ключът се добавя по-късно със sudoedit."
}

# Изпълнен — пише .env; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
