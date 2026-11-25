#!/bin/sh
# Изчаква базата, прилага миграциите (`migrate deploy`, никога `db push`), после пуска командата.
set -eu
PRISMA=./node_modules/.bin/prisma
[ -x "$PRISMA" ] || { echo "✖ Липсва prisma CLI в образа."; exit 1; }
ATTEMPTS=0
until echo 'SELECT 1;' | "$PRISMA" db execute --schema prisma/schema.prisma --stdin >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  [ "$ATTEMPTS" -lt 30 ] || { echo "✖ Базата не отговори за ~60 s."; exit 1; }
  sleep 2
done
"$PRISMA" migrate deploy
exec "$@"
