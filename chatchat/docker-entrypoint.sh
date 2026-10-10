#!/usr/bin/env bash
# Изчаква базата, прилага миграциите, после предава на подадената команда (по подразбиране
# `node dist/index.js` от CMD в Dockerfile).
#
# Ролите (NFR-03, RLS): миграциите — като СОБСТВЕНИКА (MIGRATE_DATABASE_URL), приложението — като
# chatchat_app (DATABASE_URL). Адресът на собственика се маха от средата ПРЕДИ exec: процесът на
# приложението (и всичко, пуснато от него) не го вижда. Без MIGRATE_DATABASE_URL (стар .env, ръчен
# пуск) — DATABASE_URL, както досега.
set -euo pipefail

MIGRATE_URL="${MIGRATE_DATABASE_URL:-${DATABASE_URL:-}}"
unset MIGRATE_DATABASE_URL

# Локалното CLI, не `npx`: при липсващ пакет `npx` мълчаливо тегли от мрежата.
PRISMA=./node_modules/.bin/prisma
SCHEMA=prisma/schema.prisma
[ -x "$PRISMA" ] || { echo "✖ Липсва prisma CLI в образа." >&2; exit 1; }

db_ping() {
  DATABASE_URL="$MIGRATE_URL" "$PRISMA" db execute --schema "$SCHEMA" --stdin <<'SQL'
SELECT 1;
SQL
}

echo "→ Изчаквам базата…"
attempts=0
until db_ping >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 30 ]; then
    echo "✖ Базата не отговори за ~60 секунди. Последната грешка:" >&2
    # Без пренасочване: Prisma казва причината (P1013 — счупен DATABASE_URL, напр. „/“ в паролата;
    # P1000 — грешна парола; P1001 — няма връзка), без да печата адреса или паролата.
    db_ping || true
    exit 1
  fi
  sleep 2
done

# `migrate deploy`, НИКОГА `db push`: само версионираните миграции от prisma/migrations, нула
# мълчаливи промени по схемата. При провал контейнерът не тръгва (set -e) — виж DEPLOY.md, „Връщане назад“.
echo "→ Прилагам миграциите…"
DATABASE_URL="$MIGRATE_URL" "$PRISMA" migrate deploy --schema "$SCHEMA"
unset MIGRATE_URL

if [ "$#" -eq 0 ]; then
  set -- node dist/index.js
fi
exec "$@"
