#!/bin/sh
set -e

echo "→ Изчакване на базата данни и синхронизиране на схемата…"
# Изчаква Postgres да приеме връзки (до ~60 секунди), после прилага схемата.
ATTEMPTS=0
until npx prisma db push --skip-generate 2>/dev/null; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "✖ Базата данни не отговори навреме."
    exit 1
  fi
  echo "  …опит $ATTEMPTS, изчакване 2с"
  sleep 2
done

echo "✔ Схемата е приложена. Стартиране на приложението."
exec "$@"
