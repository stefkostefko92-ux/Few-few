#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/restore-test.sh — проверено възстановяване на дъмп (вика го backup.sh след всеки бекъп).
#
#   sudo bash restore-test.sh /opt/few-few/shared/rilievi/backups/daily/rilievi-<дата>.sql.gz
#
# Временен PostgreSQL (същият образ като базата на портала, без мрежа, с временна парола) → дъмпът
# вътре в празна схема, както в DEPLOY.md (т. 6): една транзакция с ON_ERROR_STOP → броят се миграциите,
# фирмите и картите → контейнерът се маха. Живата база не се пипа. Изход 0 — дъмпът се възстановява;
# иначе 1 и какво не е минало. Печата и колко секунди е отнело възстановяването — мярка за RTO.
# Провал — аларма до RILIEVI_ALERT_URL (deploy/alert.sh), освен с RILIEVI_NO_ALERT=1: backup.sh я праща
# сам, с една причина за целия бекъп.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# shellcheck source=alert.sh
if [ -f "$(dirname "${BASH_SOURCE[0]}")/alert.sh" ]; then
  . "$(dirname "${BASH_SOURCE[0]}")/alert.sh"
else
  alert_fallito() { echo "restore-test: alert non inviato (manca deploy/alert.sh)" >&2; }
fi
name="rilievi-restore-test-$$"
REASON=""
# fail "<съобщение>" "<кратка причина за алармата, без пътища>"
fail() {
  echo "restore-test: $1" >&2
  REASON="$2"
  exit 1
}
cleanup() {
  local rc=$?
  docker rm -f "$name" >/dev/null 2>&1 || true
  if [ "$rc" != "0" ] && [ "${RILIEVI_NO_ALERT:-0}" != "1" ]; then
    alert_fallito restore-test "${REASON:-uscita inattesa (exit $rc)}"
  fi
}
trap cleanup EXIT

dump="${1:-}"
[ -f "$dump" ] || fail "няма дъмп: $dump" "dump mancante"
image="$(docker inspect -f '{{.Config.Image}}' "$(docker compose ps -q db)" 2>/dev/null || true)"
image="${image:-postgres:16-alpine}"

docker run -d --name "$name" --network none \
  -e POSTGRES_USER=rilievi -e POSTGRES_DB=rilievi \
  -e "POSTGRES_PASSWORD=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  "$image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U rilievi -d rilievi >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" pg_isready -U rilievi -d rilievi >/dev/null 2>&1 ||
  fail "временната база не тръгна" "il database temporaneo non parte"
# Първият pg_isready минава и докато initdb рестартира сървъра — кратка пауза и пак.
sleep 2
# Отрязан дъмп би стигнал до psql като „края на файла“ и транзакцията би се записала с половин база.
gzip -t "$dump" || fail "дъмпът е повреден или отрязан: $dump" "dump danneggiato o troncato"
start=$SECONDS
{ echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'; gzip -dc "$dump"; } |
  docker exec -i "$name" psql --single-transaction -v ON_ERROR_STOP=1 -q -U rilievi -d rilievi >/dev/null ||
  fail "дъмпът не се възстановява" "il dump non si ripristina (psql)"
count() { docker exec "$name" psql -tA -U rilievi -d rilievi -c "$1" | tr -dc '0-9'; }
migrations="$(count 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
aziende="$(count 'SELECT count(*) FROM "Azienda"')"
schede="$(count 'SELECT count(*) FROM "Scheda"')"
[ "${migrations:-0}" -gt 0 ] || fail "в дъмпа няма приложени миграции" "nessuna migrazione nel dump"
echo "restore-test: ok — $migrations миграции, $aziende фирми, $schede карти; възстановяването отне $((SECONDS - start)) s"
