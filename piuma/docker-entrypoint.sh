#!/bin/sh
# Изчаква базата, прилага миграциите, после предава на подадената команда.
# Работникът ползва СЪЩИЯ entrypoint — миграцията е идемпотентна, а така работникът
# никога не тръгва срещу схема, която още не е мигрирана.
set -e

# Локалното CLI, не `npx`: `npx` при липсващ пакет мълчаливо тръгва да тегли от
# мрежата, тоест грешка в образа би се показала като бавен старт, а не като провал.
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
    echo "✖ Базата не отговори за ~60 секунди."
    exit 1
  fi
  sleep 2
done

# `migrate deploy`, никога `db push`: версионирани миграции, нула мълчаливи промени.
echo "→ Прилагам миграциите…"
"$PRISMA" migrate deploy

exec "$@"
