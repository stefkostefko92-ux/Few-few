#!/bin/sh
set -e

echo "[entrypoint] Waiting for postgres..."

# Probe postgres by trying a trivial prisma query. Retry up to ~60s.
MAX_TRIES=30
TRIES=0
while true; do
  if node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\$queryRaw\`SELECT 1\`.then(() => p.\$disconnect()).then(() => process.exit(0)).catch(() => process.exit(1));
  " 2>/dev/null; then
    break
  fi
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge $MAX_TRIES ]; then
    echo "[entrypoint] ERROR: Postgres did not become reachable in ~60s"
    exit 1
  fi
  sleep 2
done
echo "[entrypoint] ✓ Postgres reachable"

echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy

# ─── Схемата на ЖИВАТА база срещу schema.prisma ──────────────────────────────
# ЗАЩО (реален инцидент, 07.08.2026): продукцията сервира 500 на `/api/panels`,
# защото `panels.groupMode` липсваше. `prisma migrate status` казваше „Database
# schema is up to date!" — той сверява ДНЕВНИКА на миграциите, не колоните.
# От същата миграция v37 две колони съществуваха, третата не: файлът е бил
# редактиран, СЛЕД като името му вече е записано като приложено, значи новият
# `ALTER` никога не се изпълни и нищо не се оплака.
#
# Prisma Client се генерира от `schema.prisma`, тоест при такова разминаване
# ВСЯКА заявка към този модел гърми с P2022. По-добре контейнерът да не тръгне,
# отколкото да се обяви за здрав и да сервира 500 на платещ клиент.
#
# `migrate diff --exit-code` връща 2 при разлика. Проверката е върху ЖИВАТА база
# (`--from-url`), не върху прясно мигрирана — точно това CI не може да види.
echo "[entrypoint] Проверявам схемата на живата база срещу schema.prisma…"
if ! npx prisma migrate diff \
      --from-url "$DATABASE_URL" \
      --to-schema-datamodel prisma/schema.prisma \
      --exit-code >/tmp/schema-drift.txt 2>&1; then
  echo "[entrypoint] ✗ РАЗМИНАВАНЕ между базата и schema.prisma:"
  cat /tmp/schema-drift.txt
  echo "[entrypoint]"
  echo "[entrypoint] Всяка заявка към засегнатите модели ще гърми с P2022."
  echo "[entrypoint] Приложи липсващото ръчно (виж диффа по-горе), после рестартирай."
  echo "[entrypoint] Само за аварийно пускане: SKIP_SCHEMA_CHECK=1 (сервира счупени маршрути)."
  [ "${SKIP_SCHEMA_CHECK:-0}" = "1" ] || exit 1
  echo "[entrypoint] ⚠ SKIP_SCHEMA_CHECK=1 — продължавам ВЪПРЕКИ разминаването."
fi
echo "[entrypoint] ✓ схемата съвпада"

echo "[entrypoint] Starting server..."
exec "$@"
