#!/bin/sh
set -e

echo "→ Изчакване на базата данни…"
# Изчаква Postgres да приеме връзки (до ~60 секунди).
ATTEMPTS=0
until npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL' >/dev/null 2>&1
SELECT 1;
SQL
do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "✖ Базата данни не отговори навреме."
    exit 1
  fi
  echo "  …опит $ATTEMPTS, изчакване 2с"
  sleep 2
done

echo "→ Прилагане на миграциите…"
# Версионирани миграции (prisma/migrations) вместо 'db push':
#  • нова база       → migrate deploy създава всичко от 0_init нататък;
#  • заварена база   → първият deploy връща P3005 („schema not empty“) —
#    маркираме baseline-а 0_init като приложен и пускаме deploy отново.
# Така деструктивна промяна вече минава през преглеждан SQL файл, а не през
# мълчалив 'db push' при старт.
if ! npx prisma migrate deploy; then
  echo "  …заварена база без история на миграциите — маркирам baseline 0_init."
  npx prisma migrate resolve --applied 0_init
  npx prisma migrate deploy
fi

echo "✔ Схемата е приложена. Стартиране на приложението."
exec "$@"
