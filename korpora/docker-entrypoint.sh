#!/bin/sh
# Изчаква базата, прилага миграциите, после предава на подадената команда.
set -e

# Локалното CLI, не `npx`: при липсващ пакет `npx` мълчаливо тегли от мрежата.
PRISMA=./node_modules/.bin/prisma
[ -x "$PRISMA" ] || { echo "✖ Липсва prisma CLI в образа."; exit 1; }

echo "→ Изчаквам базата…"
ATTEMPTS=0
until "$PRISMA" db execute --schema prisma/schema.prisma --stdin <<'SQL' >/dev/null 2>&1
SELECT 1;
SQL
do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "✖ Базата не отговори за ~60 секунди. Последната грешка:"
    # Без пренасочване: Prisma казва причината (P1013 — счупен DATABASE_URL, напр. „/“ в паролата;
    # P1000 — грешна парола; P1001 — няма връзка), без да печата адреса или паролата.
    "$PRISMA" db execute --schema prisma/schema.prisma --stdin <<'SQL' || true
SELECT 1;
SQL
    exit 1
  fi
  sleep 2
done

# `migrate deploy`, никога `db push`: версионирани миграции, нула мълчаливи промени.
echo "→ Прилагам миграциите…"
"$PRISMA" migrate deploy

exec "$@"
