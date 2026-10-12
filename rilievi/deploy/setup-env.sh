#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/setup-env.sh — еднократно на сървъра, преди първия деплой: папките на Rilievi и
# .env с генерирани тайни (DEPLOY.md, т. 1). Пита само за SMTP (Brevo, по избор); паролата на базата
# и ключът на сесиите не се показват и не остават в историята на шела.
#
#   sudo bash rilievi/deploy/setup-env.sh
#
# Никога не презаписва съществуващ .env: нова POSTGRES_PASSWORD не пасва на съществуващата база.
# Промяна — `sudoedit /opt/few-few/shared/rilievi/.env`, после деплой.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

SHARED="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}"
DOMAIN="${RILIEVI_DOMAIN:-rilievi.carbonstealth.eu}"
ENV_FILE="$SHARED/.env"

ok()   { printf '\033[32m✔ rilievi: %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✘ rilievi: %s\033[0m\n' "$*" >&2; exit 1; }

# Стойност, която влиза в .env без кавички: интервал, кавичка, „#“, „$“ или „\“ биха я счупили.
plain() {
  case "$2" in *[[:space:]\'\"\#\$\\]*) fail "$1 съдържа интервал, кавичка, #, \$ или \\ — не влиза в .env без кавички." ;; esac
}

main() {
  [ "$(id -u)" = "0" ] || fail "пусни като root (sudo)."
  command -v openssl >/dev/null 2>&1 || fail "липсва openssl."
  [ ! -e "$ENV_FILE" ] || fail "$ENV_FILE вече съществува — не го пипам. Промяна: sudoedit $ENV_FILE"

  local smtp_user="" smtp_pass=""
  read -rp 'Brevo SMTP потребител (празно — без поща, поканите се копират от екрана): ' smtp_user
  if [ -n "$smtp_user" ]; then
    read -rsp 'Brevo SMTP ключ: ' smtp_pass && echo
    [ -n "$smtp_pass" ] || fail "с потребител трябва и ключ."
    plain SMTP_USER "$smtp_user"
    plain SMTP_PASS "$smtp_pass"
  fi

  install -d -m 700 "$SHARED" "$SHARED/backups"
  local tmp
  tmp="$(mktemp "$SHARED/.env.XXXXXX")"
  {
    printf 'PUBLIC_BASE_URL=https://%s\n' "$DOMAIN"
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)"
    if [ -n "$smtp_user" ]; then
      printf 'SMTP_HOST=smtp-relay.brevo.com\nSMTP_PORT=2525\n'
      printf 'SMTP_USER=%s\nSMTP_PASS=%s\n' "$smtp_user" "$smtp_pass"
      printf 'MAIL_FROM=Rilievi Impianti <no-reply@carbonstealth.eu>\n'
    fi
  } >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$ENV_FILE"
  ok "$ENV_FILE е готов (600): паролата на базата и ключът на сесиите са генерирани."
  [ -n "$smtp_user" ] || ok "без SMTP: поканите и връзките за парола се показват на екрана за копиране."
}

# Изпълнен — пише .env; зареден със `source` (тестовете) — само дефинира функциите.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
