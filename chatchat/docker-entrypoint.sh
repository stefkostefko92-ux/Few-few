#!/usr/bin/env bash
# Изчаква базата, прилага миграциите, после предава на подадената команда (по подразбиране
# `node dist/index.js` от CMD в Dockerfile).
set -euo pipefail

# Локалното CLI, не `npx`: при липсващ пакет `npx` мълчаливо тегли от мрежата.
PRISMA=./node_modules/.bin/prisma
SCHEMA=prisma/schema.prisma
[ -x "$PRISMA" ] || { echo "✖ Липсва prisma CLI в образа." >&2; exit 1; }

db_ping() {
  "$PRISMA" db execute --schema "$SCHEMA" --stdin <<'SQL'
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
"$PRISMA" migrate deploy --schema "$SCHEMA"

if [ "$#" -eq 0 ]; then
  set -- node dist/index.js
fi
exec "$@"
