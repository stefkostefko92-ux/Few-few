#!/bin/sh
# Waits for PostgreSQL, applies the versioned migrations (never `db push`), creates the platform administrator on
# the first start when ADMIN_PASSWORD is given, then starts the application without that password in its env.
set -eu

echo "→ waiting for the database"
i=0
until echo 'SELECT 1;' | npx prisma db execute --schema prisma/schema.prisma --stdin >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then echo "✖ the database did not answer in time"; exit 1; fi
  sleep 2
done

echo "→ applying migrations"
npx prisma migrate deploy

if [ -n "${ADMIN_PASSWORD:-}" ]; then
  echo "→ platform administrator"
  node_modules/.bin/tsx scripts/create-admin.ts
fi

echo "✔ starting LiftPilot"
exec env -u ADMIN_PASSWORD "$@"
