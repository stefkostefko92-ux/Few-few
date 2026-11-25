#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# tools/vps/monitoring/probe-health.sh — ВЪНШНА проба на health маршрут с маркер на приложението.
# Вика я .github/workflows/linketto-health.yml от runner-а на GitHub (мъртъв сървър не може да се
# обади сам); става и за cron на друга машина. Сама не праща нищо и не пази състояние — само казва
# какво видя. Продуктово неутрална: адресът и маркерът са аргументи.
#
#   probe-health.sh <url> <маркер>
#     напр. probe-health.sh https://piuma.carbonstealth.eu/api/health '"app":"linketto"'
#
#   PROBE_ATTEMPTS  опити преди „down“ (3)    PROBE_PAUSE    секунди между опитите (20)
#   PROBE_TIMEOUT   --max-time на опит (10)
#
# „Здрав“ = HTTP 200 И тяло с "status":"ok" И маркера — 200 от чужд процес на порта или страница
# на прокси не е здрав. Без -k: изтекъл/чужд сертификат = „не отговаря“. Без -L: пренасочване не е
# „здрав“. Тялото не се печата (health няма лични данни, но изходът отива в публичен дневник).
# Изход (stdout и $GITHUB_OUTPUT, ако е зададен): state=up|down  detail=<код | network | 200 unexpected>
# Код 0 и при „down“ (състоянието е данни); 2 — само при лоша настройка.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

url="${1:-}"
marker="${2:-}"
attempts="${PROBE_ATTEMPTS:-3}"
pause="${PROBE_PAUSE:-20}"
timeout="${PROBE_TIMEOUT:-10}"

if [ -z "$url" ] || [ -z "$marker" ]; then
  echo "probe-health: употреба: probe-health.sh <url> <маркер>" >&2
  exit 2
fi
case "$url" in https://* | http://127.0.0.1:* | http://localhost:*) ;; *)
  echo "probe-health: адресът трябва да е https:// (или локален за тест)" >&2
  exit 2 ;;
esac
for n in "$attempts" "$pause" "$timeout"; do
  case "$n" in '' | *[!0-9]*) echo "probe-health: невалиден числов параметър" >&2 && exit 2 ;; esac
done
[ "$attempts" -ge 1 ] || attempts=1

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

state=down
detail=network
i=1
while [ "$i" -le "$attempts" ]; do
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time "$timeout" --max-filesize 65536 "$url" 2>/dev/null)" || code=000
  if [ "$code" = "200" ]; then
    if grep -qF '"status":"ok"' "$body" && grep -qF -- "$marker" "$body"; then
      state=up
      detail=200
      break
    fi
    detail="200 unexpected"
  elif [ "$code" = "000" ] || [ -z "$code" ]; then
    detail=network
  else
    detail="$code"
  fi
  [ "$i" -ge "$attempts" ] || sleep "$pause"
  i=$((i + 1))
done

printf 'state=%s\ndetail=%s\n' "$state" "$detail"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'state=%s\ndetail=%s\n' "$state" "$detail" >>"$GITHUB_OUTPUT"
fi
