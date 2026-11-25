# shellcheck shell=bash
# ─────────────────────────────────────────────────────────────────────────────
# rilievi/deploy/alert.sh — общият помощник за алармите (зарежда се със `source` от backup.sh,
# restore-test.sh, backup-alert.sh и deploy.sh; сам не прави нищо).
#
#   alert "<текст>"                       # праща текста до RILIEVI_ALERT_URL
#   alert_fallito backup "pg_dump exit 1" # „rilievi backup FALLITO su <host>: pg_dump exit 1 — <UTC>“
#
# Адресът: RILIEVI_ALERT_URL от средата, иначе редът му в $RILIEVI_SHARED/backup.env — прочетен, не
# изпълнен. Discord webhook (https://discord.com/api/webhooks/<id>/<token>; и discordapp.com, ptb., canary.)
# → POST JSON `{"content":…,"allowed_mentions":{"parse":[]}}` (никой не се споменава); друг адрес (ntfy,
# Uptime Kuma, Healthchecks /fail) → POST с текста като тяло, както досега. Адресът носи токена: НИКОГА не се
# печата и не стои в аргументите на curl (`ps` го вижда) — минава през stdin (`-K -`). Без адрес — нищо.
# Провал на изпращането не проваля скрипта: ред „alert non inviato“ в stderr, без адреса.
# Текстът — само кой скрипт, кой сървър, какво и кога: без лични данни, пътища, имейли, тайни.
# ─────────────────────────────────────────────────────────────────────────────

ALERT_MAX=1900 # Discord приема до 2000 знака в `content`

# Адресът от средата или от backup.env (последният ред, без кавичките) — без `source` на файла.
alert_url() {
  local file v
  if [ -n "${RILIEVI_ALERT_URL:-}" ]; then
    printf '%s' "$RILIEVI_ALERT_URL"
    return 0
  fi
  file="${RILIEVI_SHARED:-/opt/few-few/shared/rilievi}/backup.env"
  [ -r "$file" ] || return 0
  v="$(sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?RILIEVI_ALERT_URL=//p' "$file" | tail -n 1 | tr -d '\r')" || v=""
  v="${v%\"}" && v="${v#\"}" && v="${v%\'}" && v="${v#\'}"
  printf '%s' "$v"
}

# Само истинските хостове на Discord, само https и само пътя на webhook — `discord.com.evil.example` не е.
alert_discord() {
  local re='^https://((ptb|canary)\.)?discord(app)?\.com/api(/v[0-9]+)?/webhooks/[0-9]+/[A-Za-z0-9_-]+/?(\?[A-Za-z0-9_=&-]*)?$'
  [[ "$1" =~ $re ]]
}

# JSON низ без jq (на хоста не е гарантиран): \ " и редовете се екранират, другите управляващи знаци падат.
alert_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  s="$(printf '%s' "$s" | tr -d '\000-\010\013\014\016-\037\177')"
  printf '"%s"' "$s"
}

alert() {
  local text="$1" url body rc=0 quoted
  url="$(alert_url)"
  [ -n "$url" ] || return 0
  # Знаци, не байтове: отрязан посред буква UTF-8 би бил невалиден JSON за Discord.
  local LC_ALL=C.UTF-8 2>/dev/null
  [ "${#text}" -le "$ALERT_MAX" ] || text="${text:0:$ALERT_MAX}…"
  # Адресът — в конфигурацията на curl от stdin, с екранирани \ и ", без нов ред.
  quoted="${url//$'\n'/}"
  quoted="${quoted//\\/\\\\}"
  quoted="${quoted//\"/\\\"}"
  if alert_discord "$url"; then
    body="{\"content\":$(alert_json "$text"),\"allowed_mentions\":{\"parse\":[]}}"
    printf 'url = "%s"\n' "$quoted" |
      curl -fsS --max-time 10 --retry 2 -o /dev/null -K - \
        -H 'Content-Type: application/json' --data-raw "$body" >/dev/null 2>&1 || rc=$?
  else
    printf 'url = "%s"\n' "$quoted" |
      curl -fsS --max-time 10 --retry 2 -o /dev/null -K - --data-raw "$text" >/dev/null 2>&1 || rc=$?
  fi
  [ "$rc" = "0" ] || echo "rilievi-alert: alert non inviato (curl exit $rc; l'indirizzo non si stampa)" >&2
  return 0
}

# „rilievi <скрипт> FALLITO su <host>: <какво> — <ден час> UTC“.
alert_fallito() {
  local host
  host="$(hostname -s 2>/dev/null || uname -n)"
  alert "rilievi $1 FALLITO su ${host}: $2 — $(date -u '+%F %H:%M') UTC"
}
