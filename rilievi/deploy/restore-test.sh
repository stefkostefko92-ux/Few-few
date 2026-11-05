#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/restore-test.sh — проверено възстановяване на дъмп (вика го backup.sh след всеки бекъп).
#
#   sudo bash restore-test.sh /opt/few-few/shared/rilievi/backups/daily/rilievi-<дата>.sql.gz
#
# Временен PostgreSQL (същият образ като базата на портала, без мрежа, с временна парола) → дъмпът
# вътре с ON_ERROR_STOP → броят се миграциите, фирмите и картите → контейнерът се маха. Живата база не
# се пипа. Изход 0 — дъмпът се възстановява; иначе 1 и какво не е минало.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

dump="${1:-}"
[ -f "$dump" ] || {
  echo "restore-test: няма дъмп: $dump" >&2
  exit 1
}
image="$(docker inspect -f '{{.Config.Image}}' "$(docker compose ps -q db)" 2>/dev/null || true)"
image="${image:-postgres:16-alpine}"
name="rilievi-restore-test-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" --network none \
  -e POSTGRES_USER=rilievi -e POSTGRES_DB=rilievi \
  -e "POSTGRES_PASSWORD=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  "$image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U rilievi -d rilievi >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" pg_isready -U rilievi -d rilievi >/dev/null 2>&1 || {
  echo "restore-test: временната база не тръгна" >&2
  exit 1
}
# Първият pg_isready минава и докато initdb рестартира сървъра — кратка пауза и пак.
sleep 2
gzip -dc "$dump" | docker exec -i "$name" psql -v ON_ERROR_STOP=1 -q -U rilievi -d rilievi >/dev/null || {
  echo "restore-test: дъмпът не се възстановява" >&2
  exit 1
}
count() { docker exec "$name" psql -tA -U rilievi -d rilievi -c "$1" | tr -dc '0-9'; }
migrations="$(count 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
aziende="$(count 'SELECT count(*) FROM "Azienda"')"
schede="$(count 'SELECT count(*) FROM "Scheda"')"
[ "${migrations:-0}" -gt 0 ] || {
  echo "restore-test: в дъмпа няма приложени миграции" >&2
  exit 1
}
echo "restore-test: ok — $migrations миграции, $aziende фирми, $schede карти"
