#!/usr/bin/env bash
# Периодичните задачи на Linketto (DEPLOY.md §9). Инсталира се от
# deploy/autodeploy.sh като /usr/local/sbin/linketto-cron (700) и се пуска от
# systemd таймерите linketto-cron-{plans,digest,retention}.timer:
#
#   linketto-cron plans       POST /api/cron/plans   — ЗАДЪЛЖИТЕЛНО на всеки час
#   linketto-cron digest      POST /api/cron/digest  — дневно (08:10)
#   linketto-cron retention   сроковете от политиката (psql в контейнера на базата)
#   linketto-cron geoip       базата IP → държава (DB-IP Lite) — месечно и при деплой
#   linketto-cron backup      дневен бекъп (pg_dump + снимките), шифрован с age — 02:50
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
UPDATE "User"                SET "totpPendingSealed" = NULL WHERE "totpPendingSealed" IS NOT NULL AND "updatedAt" < now() - interval '1 day';
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

# Дневен бекъп (DEPLOY.md §7, „Бекъпи“): pg_dump + качените снимки, ШИФРОВАНИ с age към
# публичния ключ на собственика (BACKUP_AGE_RECIPIENTS в .env). Частният ключ НЕ е на сървъра —
# тук нищо не може да се разшифрова; проверката на възстановяването е
# `tools/vps/backup-verify.sh linketto-verify` с ключа, подаден през stdin.
#
# Набор = папка $DIR/<UTC време>/ (700): db.sql.gz.age, uploads.tar.gz.age, manifest.txt.age
# (брой редове по таблица, приложените миграции, брой снимки) и SHA256SUMS (за цялост без ключ).
# Нешифровано не се пише нищо на диска: дъмпът минава през поток pg_dump → броене → gzip → age.
# Пише се в .partial-* и се преименува чак при успех; ротация — последните $KEEP набора.
backup_recipients() {
  local raw r
  # Частен ключ в конфигурацията на сървъра = грешка в процедурата, не бекъп.
  if grep -q 'AGE-SECRET-KEY-' "$ENV_FILE" 2>/dev/null; then
    die "backup: в $ENV_FILE има ЧАСТЕН age ключ — махни го веднага; на сървъра стои само публичният (age1…)."
  fi
  raw="$(sed -n 's/^BACKUP_AGE_RECIPIENTS=//p' "$ENV_FILE" | tail -1 | tr -d '"'"'"'\r' | tr ',' ' ' || true)"
  for r in $raw; do
    # bech32: age1 + 58 знака от азбуката без b, i, o, 1.
    [[ "$r" =~ ^age1[02-9ac-hj-np-z]{58}$ ]] || die "backup: невалиден получател в BACKUP_AGE_RECIPIENTS (очаква се age1…, 62 знака)."
    printf '%s\n' "$r"
  done
}

backup() {
  local dir keep stamp part db app recips=() r tables rows nup old
  # Всичко, което пише бекъпът, е само за root (и извън systemd, където UMask=0077 го няма).
  umask 077
  dir="${LINKETTO_BACKUP_DIR:-$(dirname "$ENV_FILE")/backups/daily}"
  keep="${LINKETTO_BACKUP_KEEP:-14}"
  case "$keep" in ''|*[!0-9]*) die "backup: LINKETTO_BACKUP_KEEP трябва да е число." ;; esac
  [ "$keep" -ge 1 ] || keep=1
  command -v age >/dev/null 2>&1 || die "backup: липсва age (apt-get install -y age) — нешифрован бекъп не пиша."
  # Проверката в подобвивка: провал (частен ключ, невалиден получател) спира тук с нейното съобщение.
  local list
  list="$(backup_recipients)" || exit 1
  for r in $list; do recips+=(-r "$r"); done
  [ "${#recips[@]}" -gt 0 ] \
    || die "backup: BACKUP_AGE_RECIPIENTS е празен в $ENV_FILE — нешифрован бекъп не пиша (DEPLOY.md §7, „Бекъпи“)."

  db="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=db" | head -1 || true)"
  [ -n "$db" ] || die "backup: няма работещ контейнер на базата (проект $PROJECT)."
  # Снимките се четат от контейнера на app (той е собственикът им, uid 1001): този unit е без
  # capabilities и root тук не минава през data/ (750, 1001).
  # Без работещ app базата пак се бекъпва (тя е по-ценната), а unit-ът завършва с грешка накрая.
  app="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=app" | head -1 || true)"

  install -d -m 700 "$dir"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  part="$dir/.partial-$stamp"
  install -d -m 700 "$part"
  # shellcheck disable=SC2064  # пътят е известен сега — разширяваме го веднага
  trap "rm -rf '$part'" EXIT

  # 1) База: `--no-owner --no-privileges` — възстановява се във всяка празна база (и във временната
  # на проверката); правата на linketto_app ги слага scripts/deploy.sh при всеки деплой.
  # Текстов формат: всеки ред на таблица е точно един ред между `COPY …` и `\.` — awk ги брои по
  # пътя (без втори проход и без нешифрован файл), броят влиза в манифеста за сверка.
  docker exec "$db" pg_dump -U linketto -d linketto --no-owner --no-privileges \
    | awk -v out="$part/rows.txt" '
        { print }
        /^CREATE TABLE / { tables++ }
        inb && /^\\\.$/ { printf "%s %d\n", name, n > out; inb = 0; next }
        inb { n++; next }
        /^COPY public\..* FROM stdin;$/ { name = $2; n = 0; inb = 1 }
        END { printf "#tables %d\n", tables > out }' \
    | gzip -6 | age "${recips[@]}" -o "$part/db.sql.gz.age" \
    || die "backup: pg_dump/шифроването се провали — наборът НЕ е записан."
  tables="$(sed -n 's/^#tables //p' "$part/rows.txt")"
  [ "${tables:-0}" -ge 1 ] || die "backup: дъмпът е без нито една таблица — наборът НЕ е записан."
  rows="$(grep -v '^#' "$part/rows.txt" | awk '{ s += $2 } END { print s + 0 }')"

  docker exec "$db" psql -X -At -U linketto -d linketto -v ON_ERROR_STOP=1 -c \
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1' \
    > "$part/migrations.txt" || die "backup: не прочетох _prisma_migrations."

  # 2) Снимките (DATA_DIR/uploads). Празна папка/липсваща папка = празен архив, не грешка.
  local files=(db.sql.gz.age manifest.txt.age)
  if [ -n "$app" ]; then
    nup="$(docker exec "$app" sh -c 'if [ -d /data/uploads ]; then find /data/uploads -type f | wc -l; else echo 0; fi')" \
      || die "backup: не преброих снимките в app."
    nup="$(printf '%s' "$nup" | tr -dc '0-9')"
    docker exec "$app" sh -c 'cd /data && if [ -d uploads ]; then tar -czf - uploads; else tar -czf - -T /dev/null; fi' \
      | age "${recips[@]}" -o "$part/uploads.tar.gz.age" \
      || die "backup: архивът на снимките/шифроването се провали — наборът НЕ е записан."
    files+=(uploads.tar.gz.age)
  else
    nup="missing"
  fi

  # 3) Манифест (също шифрован: броят редове е бизнес информация) + контролни суми.
  {
    printf 'linketto-backup 1\ncreated %s\nuploads %s\n' "$stamp" "$nup"
    grep -v '^#' "$part/rows.txt" | sed 's/^/rows /'
    sed 's/^/migration /' "$part/migrations.txt"
  } | age "${recips[@]}" -o "$part/manifest.txt.age" || die "backup: манифестът не се шифрова."
  rm -f "$part/rows.txt" "$part/migrations.txt"
  ( cd "$part" && sha256sum "${files[@]}" > SHA256SUMS )
  mv "$part" "$dir/$stamp"
  trap - EXIT
  printf 'backup: %s — %s таблици, %s реда, %s снимки, %s (шифровано за %s получател/и)\n' \
    "$stamp" "$tables" "$rows" "$nup" "$(du -sh "$dir/$stamp" | cut -f1)" "$(( ${#recips[@]} / 2 ))"

  # 4) Ротация: само папки с точно този шаблон на името; недовършени .partial-* по-стари от ден.
  { find "$dir" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*T[0-9]*Z' -printf '%f\n' | sort -r; } \
    | tail -n +$((keep + 1)) | while read -r old; do
        [[ "$old" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] && rm -rf -- "${dir:?}/$old"
      done
  find "$dir" -mindepth 1 -maxdepth 1 -type d -name '.partial-*' -mtime +0 -exec rm -rf -- {} + 2>/dev/null || true
  [ "$nup" != "missing" ] || die "backup: app не върви — базата е бекъпната ($stamp), снимките НЕ са."
}

case "${1:-}" in
  plans)     call_route /api/cron/plans ;;
  digest)    call_route /api/cron/digest ;;
  retention) retention ;;
  geoip)     geoip ;;
  backup)    backup ;;
  *)         die "употреба: linketto-cron plans|digest|retention|geoip|backup" ;;
esac
