#!/bin/sh
set -e

echo "→ Изчакване на базата данни…"
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
# Версионирани миграции вместо `db push`:
#  • нова база     → migrate deploy изгражда всичко от 0_init нататък;
#  • заварена база → първият deploy връща P3005 („schema not empty"); маркираме
#    baseline-а 0_init като приложен и пускаме deploy отново.
#
# ВАЖНО: resolve се пуска САМО при P3005. При всеки друг провал (мрежа, P3009,
# OOM) resolve би вписал 0_init като „приложен" БЕЗ да е изпълнил SQL-а — и
# приложението би тръгнало трайно без таблици.
if ! OUT=$(npx prisma migrate deploy 2>&1); then
  echo "$OUT"
  if ! echo "$OUT" | grep -q "P3005"; then
    echo "✖ migrate deploy се провали с неочаквана грешка — спирам (без resolve)."
    exit 1
  fi
  echo "  …заварена база без история на миграциите (P3005) — маркирам baseline 0_init."
  npx prisma migrate resolve --applied 0_init
  npx prisma migrate deploy
else
  echo "$OUT"
fi

echo "✔ Схемата е приложена. Стартиране на приложението."
exec "$@"
