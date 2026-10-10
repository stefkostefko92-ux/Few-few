#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# chatchat/deploy/retention.sh — дневната ретенция (GDPR чл. 5(1)(e)): `node dist/cli/retention.js`
# в работещия контейнер на приложението, със сроковете от неговата среда (RETENTION_* в compose).
#
#   sudo chatchat-retention     # /usr/local/sbin/chatchat-retention; таймерът го пуска всеки ден в 03:17 UTC
#
# Слага го deploy/timers-install.sh. Контейнерът се търси по етикетите на compose, не по папката на
# release-а. Логът е само броевете, които казва самият CLI (без данни).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="${CHATCHAT_COMPOSE_PROJECT:-chatchat}"

die() {
  printf 'chatchat-retention: ✘ %s\n' "$*" >&2
  exit 1
}

retention() {
  local ids
  [ "$(id -u)" = 0 ] || die "пусни като root (sudo)."
  ids="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=app")" || die "docker не отговаря."
  [ -n "$ids" ] && [ "$(printf '%s\n' "$ids" | wc -l)" = 1 ] ||
    die "няма (точно един) работещ контейнер на приложението (compose проект $PROJECT) — ретенцията НЕ е пусната."
  docker exec "$ids" node dist/cli/retention.js || die "ретенцията се провали — виж journalctl -u chatchat-retention."
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then retention; fi
