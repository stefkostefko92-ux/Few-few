#!/usr/bin/env bash
# backup-verify.sh — бекъп И проверено възстановяване (VPS-аджията v2.0).
# Бекъп без тестван restore не е бекъп. Прави restic snapshot и после възстановява
# в временна папка, за да докаже, че архивът е читаем.
#
# Подкоманди:
#   backup                       — pg_dump (zabobovdol) + data/ (medqr) → restic repo
#   verify [--before <ISO>]      — restic check + test-restore в temp + сверка (по подразбиране последния
#                                  snapshot; с --before — най-новия ПРЕДИ този момент)
#   restore --before <ISO> [--target <папка>]
#                                — след инцидент: възстановява най-новия snapshot ПРЕДИ момента в НОВА
#                                  папка (по подразбиране /var/backups/few-few-restore-<час>); живите
#                                  данни не се пипат — сравняваш и връщаш на ръка
#   prune      — изчисти стари snapshot-и по политика
#   linketto-verify [--set <папка>] --identity <файл|->
#                                — Linketto (дневните набори на linketto-cron backup, шифровани с age):
#                                  sha256 → разшифроване → възстановяване във ВРЕМЕННА база → сверка на
#                                  броя редове по таблица и на миграциите с манифеста → снимките (брой).
#                                  Частният ключ е само при собственика: подава се през stdin (`-`),
#                                  без да стига до диска на сървъра. Не иска restic. Виж linketto-verify по-долу.
#
#   <ISO> е всичко, което `date -d` чете: 2026-11-14T03:00:00Z, "2026-11-14 03:00 +0200".
#
# ВАЖНО: `restic check` доказва ЦЯЛОСТ (архивът е читаем и непокътнат), НЕ че данните в него
# са чисти. Снимка, направена след пробив, вярно пази и пробива — затова при инцидент избирай
# снимка отпреди първия признак (--before), не „последната здрава".
#
# Изисква: restic. ENV: RESTIC_REPOSITORY, RESTIC_PASSWORD (или _FILE). По избор
# S3/B2 backend за off-site. Тайните остават извън репото (mode 600).
set -euo pipefail
die(){ printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
ok(){  printf '\033[32m✔ %s\033[0m\n' "$*"; }
inf(){ printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
# restic е нужен на всички подкоманди освен linketto-verify (тя чете локалните age набори).
need_restic(){
  command -v restic >/dev/null || die "Липсва restic. apt-get install -y restic"
  : "${RESTIC_REPOSITORY:?задай RESTIC_REPOSITORY}"
  STAGE="${STAGE:-/var/backups/few-few}"; mkdir -p "$STAGE"
}

cmd_backup(){
  inf "Снимка на данните…"
  if command -v docker >/dev/null && docker compose -f "${ZBD_COMPOSE:-/opt/few-few/current/zabobovdol/docker-compose.yml}" ps >/dev/null 2>&1; then
    docker compose -f "${ZBD_COMPOSE:-/opt/few-few/current/zabobovdol/docker-compose.yml}" exec -T db \
      pg_dump -U "${POSTGRES_USER:-zbd}" "${POSTGRES_DB:-zbd}" > "$STAGE/zabobovdol.sql" && ok "pg_dump"
  fi
  [ -d "${MEDQR_DATA:-/opt/medqr/data}" ] && cp -a "${MEDQR_DATA:-/opt/medqr/data}" "$STAGE/medqr-data" && ok "medqr data/"
  # Linketto: последният дневен набор — вече шифрован с age (ключът е при собственика), копира се както е.
  local lnk; lnk="$(linketto_latest_set 2>/dev/null || true)"
  if [ -n "$lnk" ]; then
    rm -rf "$STAGE/linketto-latest"; cp -a "$lnk" "$STAGE/linketto-latest" && ok "linketto (age) $(basename "$lnk")"
  fi
  restic backup "$STAGE" --tag few-few && ok "restic snapshot готов"
}

# ID на най-новия snapshot (таг few-few) СТРОГО преди момента $1 (ISO, през `date -d`). Печата „ID ВРЕМЕ".
snapshot_before(){
  local cutoff
  cutoff="$(date -d "$1" +%s 2>/dev/null)" || die "Невалиден момент за --before: $1 (пример: 2026-11-14T03:00:00Z)"
  command -v python3 >/dev/null || die "Липсва python3 (нужен за избора на snapshot по време)."
  restic snapshots --tag few-few --json | python3 -c '
import json, re, sys
from datetime import datetime
cutoff = int(sys.argv[1])
best = None
for s in json.load(sys.stdin):
    t = re.sub(r"(\.\d{6})\d+", r"\1", s["time"]).replace("Z", "+00:00")  # restic дава наносекунди
    ts = datetime.fromisoformat(t).timestamp()
    if ts < cutoff and (best is None or ts > best[0]):
        best = (ts, s["id"], s["time"])
if best is None:
    sys.exit(3)
print(best[1], best[2])
' "$cutoff" || die "Няма snapshot (таг few-few) преди $1."
}

# Разбор на опциите след подкомандата.
BEFORE=""; TARGET=""; LSET=""; IDENTITY=""
parse_opts(){
  while [ $# -gt 0 ]; do
    case "$1" in
      --before) [ $# -ge 2 ] || die "--before иска момент"; BEFORE="$2"; shift 2;;
      --target) [ $# -ge 2 ] || die "--target иска папка"; TARGET="$2"; shift 2;;
      --set) [ $# -ge 2 ] || die "--set иска папка на набор"; LSET="$2"; shift 2;;
      --identity) [ $# -ge 2 ] || die "--identity иска файл или -"; IDENTITY="$2"; shift 2;;
      *) die "Непозната опция: $1";;
    esac
  done
}

cmd_verify(){
  # Цялост, не чистота: зелен check не значи „без пробив" (виж ВАЖНО горе).
  inf "restic check (целост на архива — НЕ доказва липса на компрометиране)…"; restic check --read-data-subset=10%
  local snap="latest" pick tmp
  if [ -n "$BEFORE" ]; then
    pick="$(snapshot_before "$BEFORE")"; snap="${pick%% *}"
    inf "Избран snapshot преди $BEFORE: $pick"
  fi
  tmp="$(mktemp -d)"
  inf "Test-restore на snapshot $snap → $tmp"
  restic restore "$snap" --target "$tmp"
  if [ -s "$tmp$STAGE/zabobovdol.sql" ] || ls "$tmp$STAGE"/medqr-data >/dev/null 2>&1; then
    ok "Възстановяването е читаемо — бекъпът е валиден."
  else
    rm -rf "$tmp"; die "Restore не съдържа очакваните файлове — бекъпът Е ПОД ВЪПРОС."
  fi
  rm -rf "$tmp"
}

# След инцидент: снимката отпреди момента → НОВА папка. Нищо живо не се презаписва.
cmd_restore(){
  [ -n "$BEFORE" ] || die "restore иска --before <ISO> — моментът преди първия признак на инцидента."
  local pick snap target
  pick="$(snapshot_before "$BEFORE")"; snap="${pick%% *}"
  target="${TARGET:-/var/backups/few-few-restore-$(date +%Y%m%d-%H%M%S)}"
  [ ! -e "$target" ] || [ -z "$(ls -A "$target" 2>/dev/null)" ] || die "$target не е празна — избери нова папка (--target)."
  install -d -m 700 "$target"
  inf "Възстановявам snapshot $pick → $target"
  restic restore "$snap" --target "$target"
  ok "Готово: $target (mode 700). Живите данни НЕ са пипани — сравни и върни на ръка, след бекъп на текущото."
}

cmd_prune(){ restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune && ok "prune готов"; }

# ── Linketto: проверено възстановяване на шифрования дневен набор ───────────────────────────────
# Наборът (linketto/deploy/linketto-cron.sh → backup): db.sql.gz.age, uploads.tar.gz.age,
# manifest.txt.age, SHA256SUMS. Стъпки: sha256 (цялост без ключ) → манифест → дъмпът във ВРЕМЕННА база
# → брой редове по таблица = манифеста → приложените миграции = манифеста (и без провалени) → брой снимки.
# Живата база не се пипа. Нищо от данните не се печата — само броеве.
#
# Временната база — едно от двете:
#   по подразбиране: еднократен контейнер $LINKETTO_VERIFY_PG_IMAGE без мрежа (--network none), данните в
#                    tmpfs, изтрива се накрая;
#   LINKETTO_VERIFY_PG_URL=postgresql://<потребител>@<хост>:<порт>/postgres — съществуващ PostgreSQL ≥16
#                    (потребител с CREATEDB), в който се създава и после трие база linketto_restore_<…>.
#                    БЕЗ парола и без параметри в адреса (той стига до argv на psql) — паролата е от
#                    PGPASSWORD или ~/.pgpass.
#
# Пример (ключът минава само през SSH, не стига до диска на сървъра):
#   ssh root@<сървър> 'bash /opt/few-few/current/tools/vps/backup-verify.sh linketto-verify --identity -' \
#     < ~/.config/age/linketto-backup.txt
LINKETTO_BACKUP_DIR="${LINKETTO_BACKUP_DIR:-/opt/few-few/shared/linketto/backups/daily}"
LINKETTO_VERIFY_PG_IMAGE="${LINKETTO_VERIFY_PG_IMAGE:-postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea}"

linketto_latest_set(){
  [ -d "$LINKETTO_BACKUP_DIR" ] || return 1
  local last
  last="$(find "$LINKETTO_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*T[0-9]*Z' -printf '%f\n' | sort | tail -1)"
  [ -n "$last" ] || return 1
  printf '%s/%s\n' "$LINKETTO_BACKUP_DIR" "$last"
}

cmd_linketto_verify(){
  command -v age >/dev/null || die "Липсва age (apt-get install -y age)."
  local bset ident manifest n want got tbl failed=0 total=0 ntab=0 wantmig gotmig nup up_count
  bset="${LSET:-$(linketto_latest_set || true)}"
  [ -n "$bset" ] && [ -d "$bset" ] || die "Няма набор за проверка (${LSET:-$LINKETTO_BACKUP_DIR}) — пуснат ли е linketto-cron backup?"
  [ -n "$IDENTITY" ] || die "linketto-verify иска --identity <файл|-> (частният age ключ на собственика)."
  # Ключът стои само в паметта; на age се подава през /dev/fd (process substitution), не през диск/argv.
  if [ "$IDENTITY" = "-" ]; then ident="$(cat)"; else [ -r "$IDENTITY" ] || die "Не чета $IDENTITY"; ident="$(cat -- "$IDENTITY")"; fi
  printf '%s' "$ident" | grep -q '^AGE-SECRET-KEY-1' || die "Това не е age identity (очаква се AGE-SECRET-KEY-1…)."
  dec(){ age -d -i <(printf '%s\n' "$ident") "$1"; }

  inf "Набор: $(basename "$bset")"
  ( cd "$bset" && sha256sum --quiet -c SHA256SUMS ) || die "SHA256SUMS не съвпада — наборът е повреден/подменен."
  ok "sha256 — цял"
  manifest="$(dec "$bset/manifest.txt.age")" || die "Манифестът не се разшифрова (грешен ключ?)."
  printf '%s\n' "$manifest" | head -1 | grep -qx 'linketto-backup 1' || die "Непознат формат на манифеста."

  # Временната база.
  local pgurl="" cname="" dbn
  dbn="linketto_restore_$(date +%s)_$$"
  if [ -n "${LINKETTO_VERIFY_PG_URL:-}" ]; then
    pgurl="$LINKETTO_VERIFY_PG_URL"
    psql -X -q "$pgurl" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$dbn\"" >/dev/null || die "Не създадох временната база."
    # shellcheck disable=SC2064  # имената са известни сега
    trap "psql -X -q '$pgurl' -c 'DROP DATABASE IF EXISTS \"$dbn\"' >/dev/null 2>&1 || true" EXIT
    rsql(){ psql -X -q "${pgurl%/*}/$dbn" -v ON_ERROR_STOP=1 "$@"; }
  else
    command -v docker >/dev/null || die "Няма docker — задай LINKETTO_VERIFY_PG_URL към временен PostgreSQL."
    cname="linketto-restore-$$"
    docker run -d --rm --name "$cname" --network none --tmpfs /var/lib/postgresql/data:size=2g \
      -e POSTGRES_HOST_AUTH_METHOD=trust "$LINKETTO_VERIFY_PG_IMAGE" >/dev/null || die "Не вдигнах временния PostgreSQL."
    # shellcheck disable=SC2064
    trap "docker rm -f '$cname' >/dev/null 2>&1 || true" EXIT
    # По TCP (127.0.0.1): по време на init сървърът слуша само на сокета — така чакаме истинския старт.
    for n in $(seq 1 60); do docker exec "$cname" pg_isready -q -h 127.0.0.1 -U postgres && break; [ "$n" = 60 ] && die "Временният PostgreSQL не тръгна."; sleep 1; done
    docker exec "$cname" createdb -h 127.0.0.1 -U postgres "$dbn" || die "Не създадох временната база."
    rsql(){ docker exec -i "$cname" psql -X -q -h 127.0.0.1 -U postgres -d "$dbn" -v ON_ERROR_STOP=1 "$@"; }
  fi

  inf "Възстановявам във временна база $dbn…"
  dec "$bset/db.sql.gz.age" | gzip -dc | rsql >/dev/null || die "Възстановяването падна — бекъпът Е ПОД ВЪПРОС."

  # Редове по таблица: всяка таблица от манифеста, точно същият брой.
  while read -r tbl want; do
    # pg_dump слага кавички само при нужда: public."User", но public._prisma_migrations.
    [[ "$tbl" =~ ^public\.(\"[A-Za-z0-9_]+\"|[a-z_][a-z0-9_]*)$ ]] && [[ "$want" =~ ^[0-9]+$ ]] \
      || { warn_line "непознат ред в манифеста"; failed=1; continue; }
    # </dev/null: в режима с контейнер `docker exec -i` иначе изяжда stdin на цикъла (остатъка от манифеста).
    got="$(rsql -At -c "SELECT count(*) FROM $tbl" </dev/null)" || got="?"
    ntab=$((ntab + 1)); total=$((total + want))
    if [ "$got" != "$want" ]; then printf '  ✘ %s: %s в манифеста, %s възстановени\n' "$tbl" "$want" "$got"; failed=1; fi
  done < <(printf '%s\n' "$manifest" | sed -n 's/^rows //p')
  [ "$ntab" -ge 1 ] || die "Манифестът е без таблици."
  [ "$failed" = 0 ] || die "Броят редове НЕ съвпада — бекъпът Е ПОД ВЪПРОС."
  ok "Редове: $ntab таблици, $total реда — съвпадат с манифеста"

  # Миграциите: приложените във възстановената база = манифеста; провалена (finished_at NULL) = грешка.
  wantmig="$(printf '%s\n' "$manifest" | sed -n 's/^migration //p' | sort)"
  gotmig="$(rsql -At -c 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1' </dev/null | sort)" \
    || die "Няма _prisma_migrations във възстановената база."
  [ "$wantmig" = "$gotmig" ] || die "Миграциите във възстановената база не съвпадат с манифеста."
  [ "$(rsql -At -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL' </dev/null)" = "0" ] \
    || die "В бекъпа има започната, недовършена миграция."
  ok "Миграции: $(printf '%s\n' "$gotmig" | grep -c .) приложени — съвпадат"
  # Сверка с кода (по избор): миграция в бекъпа, която кодът не познава = бекъп от по-нов код.
  local mdir="${LINKETTO_MIGRATIONS_DIR:-$(dirname "$0")/../../linketto/prisma/migrations}" m ahead=0
  if [ -d "$mdir" ]; then
    while read -r m; do [ -z "$m" ] || [ -d "$mdir/$m" ] || { printf '  ⚠ %s: няма я в %s\n' "$m" "$mdir"; }; done <<< "$gotmig"
    for m in "$mdir"/*/; do m="$(basename "$m")"; printf '%s\n' "$gotmig" | grep -qx "$m" || ahead=$((ahead + 1)); done
    [ "$ahead" = 0 ] || inf "Кодът има $ahead миграция/и след бекъпа — при възстановяване ги прилага prisma migrate deploy."
  fi

  # Снимките.
  nup="$(printf '%s\n' "$manifest" | sed -n 's/^uploads //p')"
  if [ "$nup" = "missing" ]; then
    die "Наборът е БЕЗ снимки (app не е вървял при бекъпа) — базата е проверена, снимките не."
  fi
  up_count="$(dec "$bset/uploads.tar.gz.age" | tar -tzf - | { grep -vc '/$' || true; })" \
    || die "Архивът на снимките не се разшифрова/чете."
  [ "$up_count" = "$nup" ] || die "Снимки: $nup в манифеста, $up_count в архива."
  ok "Снимки: $up_count — съвпадат"
  ok "Linketto: възстановяването е проверено ($(basename "$bset"))."
}
warn_line(){ printf '  ⚠ %s\n' "$*" >&2; }

sub="${1:-verify}"; [ $# -gt 0 ] && shift
parse_opts "$@"
case "$sub" in
  backup)  need_restic; cmd_backup;;
  verify)  need_restic; cmd_verify;;
  restore) need_restic; cmd_restore;;
  prune)   need_restic; cmd_prune;;
  linketto-verify) cmd_linketto_verify;;
  *) die "backup | verify [--before <ISO>] | restore --before <ISO> [--target <папка>] | prune | linketto-verify [--set <папка>] --identity <файл|->";;
esac
