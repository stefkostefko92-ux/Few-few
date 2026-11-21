#!/usr/bin/env bash
# Периодичните задачи на Linketto (DEPLOY.md §9). Инсталира се от
# deploy/autodeploy.sh като /usr/local/sbin/linketto-cron (700) и се пуска от
# systemd таймерите linketto-cron-{plans,digest,retention}.timer:
#
#   linketto-cron plans       POST /api/cron/plans   — ЗАДЪЛЖИТЕЛНО на всеки час
#   linketto-cron digest      POST /api/cron/digest  — дневно (08:10)
#   linketto-cron retention   сроковете от политиката (psql в контейнера на базата)
#   linketto-cron geoip       базата IP → държава (DB-IP Lite) — месечно и при деплой
#
# CRON_SECRET се чете от файла с тайните (mode 600) и стига до curl през stdin
# (`-K -`), никога като аргумент: argv се вижда от всеки през `ps`, а crontab/
# unit файлът — от всеки с достъп до /etc. Дневник: journalctl -u 'linketto-cron@*'
set -euo pipefail

ENV_FILE="${LINKETTO_ENV:-/opt/few-few/shared/linketto/.env}"
# Портът е HTTP_PORT от същия файл (като docker-compose.yml), иначе 4350; LINKETTO_LOCAL_URL побеждава.
BASE_URL="${LINKETTO_LOCAL_URL:-}"
if [ -z "$BASE_URL" ]; then
  port="$(sed -n 's/^HTTP_PORT=//p' "$ENV_FILE" 2>/dev/null | tail -1 | tr -dc '0-9' || true)"
  BASE_URL="http://127.0.0.1:${port:-4350}"
fi
# Името на Compose проекта е фиксирано в docker-compose.yml (`name: linketto`) —
# контейнерът на базата се намира по етикет, без да се знае от кой release е вдигнат.
PROJECT="${LINKETTO_COMPOSE_PROJECT:-linketto}"

die() { printf 'linketto-cron: %s\n' "$*" >&2; exit 1; }

cron_secret() {
  [ -r "$ENV_FILE" ] || die "не чета $ENV_FILE"
  local s
  s="$(sed -n 's/^CRON_SECRET=//p' "$ENV_FILE" | tail -1 | tr -d '"'"'"'\r' || true)"
  [ "${#s}" -ge 24 ] || die "CRON_SECRET липсва или е под 24 знака в $ENV_FILE — маршрутите са изключени (503)."
  printf '%s' "$s"
}

# POST към cron маршрут. Тайната минава през stdin на curl (`-K -`, here-string —
# в bash 5.2 е pipe): не е в argv (`ps`) и не стига до дневника — печатат се само
# кодът и тялото на отговора.
call_route() {
  local path="$1" secret out code body
  secret="$(cron_secret)"
  out="$(curl -sS --max-time 600 -X POST -K - -w '\n%{http_code}' "$BASE_URL$path" \
    <<<"header = \"Authorization: Bearer ${secret}\"")" \
    || die "$path: няма връзка с $BASE_URL (app не върви?)"
  code="${out##*$'\n'}"
  body="${out%$'\n'*}"
  printf '%s %s\n' "$code" "$body"
  case "$code" in
    2*) return 0 ;;
    # Без BREVO_API_KEY/EMAIL_FROM отчетът няма как да тръгне — очаквано до
    # попълването им (DEPLOY.md §7), не авария: иначе unit-ът стои „failed“ всеки
    # ден и заглушава истинските провали.
    503) case "$body" in *'email not configured'*) printf '%s: пропуснато — имейлът (Brevo) не е настроен\n' "$path"; return 0 ;; esac ;;
  esac
  die "$path върна $code"
}

retention() {
  local db
  db="$(docker ps -q \
    --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=db" | head -1 || true)"
  [ -n "$db" ] || die "няма работещ контейнер на базата (проект $PROJECT)."
  # Сроковете = src/lib/retention-days.ts (единният източник; тестът
  # src/lib/__tests__/retention-cron.test.ts сверява числата тук с него).
  # Една транзакция (`-1`) + ON_ERROR_STOP: всичко или нищо.
  docker exec -i "$db" psql -U linketto -d linketto -v ON_ERROR_STOP=1 -1 <<'SQL'
DELETE FROM "ClickEvent"     WHERE "createdAt" < now() - interval '396 days';
DELETE FROM "ContactMessage" WHERE "createdAt" < now() - interval '365 days';
DELETE FROM "Booking"        WHERE "createdAt" < now() - interval '365 days';
DELETE FROM "LoginEvent"     WHERE "createdAt" < now() - interval '90 days';
DELETE FROM "Subscriber"     WHERE "confirmedAt" IS NULL AND "createdAt" < now() - interval '30 days';
DELETE FROM "BuyerToken"     WHERE "expiresAt" < now() - interval '1 day';
DELETE FROM "BuyerSession"   WHERE "expiresAt" < now();
DELETE FROM "Session"        WHERE "expiresAt" < now();
DELETE FROM "SecurityEvent"  WHERE "createdAt" < now() - interval '90 days';
DELETE FROM "LoginChallenge" WHERE "expiresAt" < now();
DELETE FROM "UserToken"      WHERE "expiresAt" < now() - interval '1 day';
SQL
}

# Базата IP → държава за езика по държава (docs/geo-autotranslate-spec.md, А):
# DB-IP IP to Country Lite (CC BY 4.0, без акаунт, ново издание всеки месец).
# Сваля се в $STATE/geoip (монтирана :ro в контейнера като /geoip); app я
# презарежда сам при смяна на файла. IP адреси не излизат никъде — само сваляме.
# Атомарно: временен файл → проверка → mv. Правата са изрични (644): unit-ът е с
# UMask=0077, а приложението в контейнера чете като uid 1001.
geoip() {
  local dir tmp m
  # Отделна папка на root (755), монтирана :ro в контейнера като /geoip — root
  # cron-ът не пише в папка, която контролира приложението (без symlink риск),
  # а unit-ът е без capabilities и не би минал през data/ (750, 1001).
  dir="${LINKETTO_GEOIP_HOST:-$(dirname "$ENV_FILE")/geoip}"
  install -d -m 755 "$dir"
  tmp="$(mktemp "$dir/.dbip.XXXXXX")"
  # shellcheck disable=SC2064  # пътят е известен сега — разширяваме го веднага
  trap "rm -f '$tmp' '$tmp.gz'" EXIT
  # Текущият месец, а ако изданието още не е излязло — предишният.
  for m in "$(date -u +%Y-%m)" "$(date -u -d "$(date -u +%Y-%m-01) -1 day" +%Y-%m)"; do
    curl -fsS --max-time 300 -o "$tmp.gz" "https://download.db-ip.com/free/dbip-country-lite-$m.mmdb.gz" || continue
    gunzip -c "$tmp.gz" > "$tmp" || continue
    # Истинска MaxMind DB: над 1 MB и с маркера на метаданните.
    if [ "$(stat -c %s "$tmp")" -gt 1000000 ] && grep -aq 'MaxMind.com' "$tmp"; then
      chmod 644 "$tmp"
      mv -f "$tmp" "$dir/dbip-country-lite.mmdb"
      printf 'geoip: базата е обновена (издание %s)\n' "$m"
      return 0
    fi
  done
  die "geoip: не успях да сваля базата от download.db-ip.com (езикът пада към Accept-Language)"
}

case "${1:-}" in
  plans)     call_route /api/cron/plans ;;
  digest)    call_route /api/cron/digest ;;
  retention) retention ;;
  geoip)     geoip ;;
  *)         die "употреба: linketto-cron plans|digest|retention|geoip" ;;
esac
