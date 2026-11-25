#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/monitor-health.sh — външната проверка на /health (вика я .github/workflows/rilievi-health.yml
# от runner-а на GitHub; на сървъра не се пуска). Сама не праща нищо и не пази състояние — само казва какво видя.
#
#   RILIEVI_HEALTH_URL       адресът на /health (задължителен; не е таен)
#   RILIEVI_HEALTH_ATTEMPTS  опити преди „giu“ (3)      RILIEVI_HEALTH_PAUSE  секунди между опитите (20)
#   RILIEVI_HEALTH_TIMEOUT   --max-time на опит (10)
#
# „Здрав“ = HTTP 200 И тяло с "status":"ok" и "app":"rilievi" (src/routes/health.ts) — 200 от друг процес на порта
# или от страница на прокси не е здрав. Без -k: изтекъл или чужд сертификат е същото като „не отговаря“.
# Изход (stdout, и в $GITHUB_OUTPUT ако е зададен; идемпотентно — само чете):
#   stato=su|giu      dettaglio=<код | errore di rete | 200, risposta inattesa> (на последния опит)
# Излиза с 0 и при „giu“ (състоянието е данни, не грешка на скрипта); с 2 — само при лоша настройка.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

url="${RILIEVI_HEALTH_URL:-}"
attempts="${RILIEVI_HEALTH_ATTEMPTS:-3}"
pause="${RILIEVI_HEALTH_PAUSE:-20}"
timeout="${RILIEVI_HEALTH_TIMEOUT:-10}"

if [ -z "$url" ]; then
  echo "monitor-health: RILIEVI_HEALTH_URL manca" >&2
  exit 2
fi
for n in "$attempts" "$pause" "$timeout"; do
  case "$n" in '' | *[!0-9]*) echo "monitor-health: parametro numerico non valido" >&2 && exit 2 ;; esac
done
[ "$attempts" -ge 1 ] || attempts=1

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

stato=giu
dettaglio="errore di rete"
i=1
while [ "$i" -le "$attempts" ]; do
  code=000
  # --max-time: нито един опит не виси; без -k; -L няма — пренасочването не е „здрав“.
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time "$timeout" "$url" 2>/dev/null)" || code=000
  if [ "$code" = "200" ]; then
    if grep -q '"status":"ok"' "$body" && grep -q '"app":"rilievi"' "$body"; then
      stato=su
      dettaglio=200
      break
    fi
    dettaglio="200, risposta inattesa"
  elif [ "$code" = "000" ] || [ -z "$code" ]; then
    dettaglio="errore di rete"
  else
    dettaglio="$code"
  fi
  [ "$i" -ge "$attempts" ] || sleep "$pause"
  i=$((i + 1))
done

printf 'stato=%s\ndettaglio=%s\n' "$stato" "$dettaglio"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'stato=%s\ndettaglio=%s\n' "$stato" "$dettaglio" >>"$GITHUB_OUTPUT"
fi
