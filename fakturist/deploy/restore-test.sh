#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fakturist/deploy/restore-test.sh — проверено възстановяване на дъмп (вика го backup.sh след всеки бекъп).
#
#   cd "$(sudo head -n 1 /opt/few-few/shared/fakturist/last-good)" &&
#     sudo bash deploy/restore-test.sh /opt/few-few/shared/fakturist/backups/daily/fakturist-<дата>.sql.gz
#
# Временен PostgreSQL (същият образ като базата на Фактурист, без мрежа, с временна парола) → дъмпът
# вътре с ON_ERROR_STOP → проверки → контейнерът се маха ЗАЕДНО с тома си (-v: възстановените лични
# данни не остават на диска). Живата база не се пипа. Проверките:
#   - има приложени миграции;
#   - броят редове в "Document" и "AuditLog" е точно колкото редовете им в дъмпа (нищо не е изпуснато);
#   - веригите са цели: документите на всяка фирма са с поредни chainIndex 1…n и всеки prevHash е
#     sha256 на предишния (първият — нули); всеки ред на одита сочи хеша на предишния.
#     Печатът (HMAC с LEDGER_SEAL_KEY) не се проверява тук — ключът не излиза от .env; него проверява
#     мастър панелът на живата база.
# Изход 0 — дъмпът се възстановява и веригите са цели; иначе 1 и какво не е минало.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SETTLE="${FAKTURIST_RESTORE_SETTLE:-2}"

say() { echo "restore-test: $*"; }
fail() {
  echo "restore-test: $*" >&2
  exit 1
}

dump="${1:-}"
if [ -z "$dump" ] || [ ! -f "$dump" ]; then fail "няма дъмп: ${dump:-(не е подаден)}"; fi
gzip -t "$dump" 2>/dev/null || fail "дъмпът е повреден (gzip): $dump"

# Редовете на таблица в дъмпа: между „COPY public."<таблица>" (…) FROM stdin;“ и „\.“ (един ред — един
# запис: в текстовия формат на COPY новите редове в данните са екранирани). Няма блок — „-“.
dump_rows() {
  gzip -dc "$dump" | awk -v head="COPY public.\"$1\" " '
    index($0, head) == 1 { on = 1; seen = 1; next }
    on && $0 == "\\." { on = 0; next }
    on { n++ }
    END { if (seen) print n + 0; else print "-" }'
}
docs_in_dump="$(dump_rows Document)"
audit_in_dump="$(dump_rows AuditLog)"
[ "$docs_in_dump" != "-" ] || fail "в дъмпа няма таблица \"Document\""
[ "$audit_in_dump" != "-" ] || fail "в дъмпа няма таблица \"AuditLog\""

image="$(docker inspect -f '{{.Config.Image}}' "$(docker compose ps -q db 2>/dev/null)" 2>/dev/null || true)"
image="${image:-postgres:16-alpine}"
name="fakturist-restore-test-$$"
cleanup() { docker rm -f -v "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" --network none \
  --memory 512m --pids-limit 256 --security-opt no-new-privileges:true \
  -e POSTGRES_USER=fakturist -e POSTGRES_DB=fakturist \
  -e "POSTGRES_PASSWORD=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  "$image" >/dev/null || fail "временната база не се създаде (образ: $image)"
ready=0
for _ in $(seq 1 60); do
  if docker exec "$name" pg_isready -U fakturist -d fakturist >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" = "1" ] || fail "временната база не тръгна"
# Първият pg_isready минава и докато initdb рестартира сървъра — кратка пауза и пак.
sleep "$SETTLE"
docker exec "$name" pg_isready -U fakturist -d fakturist >/dev/null 2>&1 || fail "временната база не тръгна"

gzip -dc "$dump" | docker exec -i "$name" psql -v ON_ERROR_STOP=1 -q -U fakturist -d fakturist >/dev/null ||
  fail "дъмпът не се възстановява"

count() {
  local n
  n="$(docker exec "$name" psql -v ON_ERROR_STOP=1 -tA -U fakturist -d fakturist -c "$1" | tr -dc '0-9')" ||
    fail "заявката не мина: $1"
  [ -n "$n" ] || fail "заявката не върна число: $1"
  printf '%s' "$n"
}
migrations="$(count 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
docs="$(count 'SELECT count(*) FROM "Document"')"
audit="$(count 'SELECT count(*) FROM "AuditLog"')"
# Звено, което не е на мястото си: пропуснат или повторен chainIndex, или prevHash ≠ sha256 на предишния.
broken_docs="$(count "SELECT count(*) FROM (
  SELECT \"chainIndex\", \"prevHash\",
         row_number() OVER w AS n, lag(\"sha256\") OVER w AS prev
    FROM \"Document\" WHERE \"chainIndex\" IS NOT NULL
  WINDOW w AS (PARTITION BY \"organizationId\" ORDER BY \"chainIndex\")
) c WHERE \"chainIndex\" <> c.n OR \"prevHash\" IS DISTINCT FROM coalesce(c.prev, repeat('0', 64))")"
# Одитът е една верига по id; първият запазен ред не се сравнява (срок за одита би изрязал началото).
broken_audit="$(count "SELECT count(*) FROM (
  SELECT \"prevHash\", lag(\"hash\") OVER (ORDER BY id) AS prev FROM \"AuditLog\"
) a WHERE a.prev IS NOT NULL AND \"prevHash\" <> a.prev")"

[ "$migrations" -gt 0 ] || fail "в дъмпа няма приложени миграции"
[ "$docs" = "$docs_in_dump" ] ||
  fail "\"Document\": $docs реда във възстановената база, $docs_in_dump в дъмпа — веригата НЕ е цяла"
[ "$audit" = "$audit_in_dump" ] ||
  fail "\"AuditLog\": $audit реда във възстановената база, $audit_in_dump в дъмпа — веригата НЕ е цяла"
[ "$broken_docs" = "0" ] || fail "веригата на документите е скъсана: $broken_docs звена не са на мястото си"
[ "$broken_audit" = "0" ] || fail "веригата на одита е скъсана: $broken_audit реда не сочат предишния"
say "ok — $migrations миграции, $docs документа, $audit записа в одита, веригите са цели"
