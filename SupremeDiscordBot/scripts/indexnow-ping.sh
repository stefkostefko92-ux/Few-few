#!/usr/bin/env bash
# scripts/indexnow-ping.sh — автоматично уведомяване на търсачките при deploy.
#
# IndexNow е официалният протокол за мигновено индексиране: едно POST-ване
# уведомява Bing, Yandex, Seznam и Naver едновременно (api.indexnow.org
# препредава към всички участващи търсачки). Старите sitemap-ping endpoint-и
# на Bing и Google са СПРЕНИ (2023) — IndexNow е заместителят за Bing.
# Google не участва в IndexNow: за Google property-то се добавя еднократно в
# Search Console (docs/SEO.md), след което Google чете sitemap.xml сам.
#
# Собствеността се доказва чрез публичния ключ файл /<key>.txt, който се
# билдва в dist/ от frontend/public/ и се сервира от nginx.
#
# Извиква се от deploy.sh / update.sh СЛЕД успешен health check. Fail-safe:
# грешка тук никога не проваля деплоя (winner е живият сайт, ping-ът е бонус).
# deploy-check: allow-no-errexit — ping-ът е страничен ефект след успешен деплой; всеки провал се докладва и скриптът завършва с 0 (виж края), `-e` би го превърнал в провал на деплоя
set -uo pipefail

HOST="${INDEXNOW_HOST:-supremebot.carbonstealth.eu}"
KEY="${INDEXNOW_KEY:-09d438d11f84037ca203486287865836}"
SITEMAP="$(dirname "$0")/../frontend/public/sitemap.xml"

if [ ! -f "$SITEMAP" ]; then
  echo "[indexnow] sitemap не е намерен ($SITEMAP) — пропускам ping."
  exit 0
fi

# Извличаме всички <loc> URL-и от sitemap-а (те са source of truth за публичните маршрути).
URLS=$(grep -oE '<loc>[^<]+</loc>' "$SITEMAP" | sed -E 's#</?loc>##g')
if [ -z "$URLS" ]; then
  echo "[indexnow] няма URL-и в sitemap-а — пропускам."
  exit 0
fi

URL_JSON=$(printf '%s\n' "$URLS" | sed 's/^/"/; s/$/",/' | tr -d '\n' | sed 's/,$//')

PAYLOAD=$(cat <<JSON
{
  "host": "${HOST}",
  "key": "${KEY}",
  "keyLocation": "https://${HOST}/${KEY}.txt",
  "urlList": [${URL_JSON}]
}
JSON
)

# Собствен временен файл (не фиксиран /tmp път, в който root пише — symlink атака).
RESP="$(mktemp)"; trap 'rm -f "$RESP"' EXIT
HTTP_CODE=$(curl -sS -o "$RESP" -w "%{http_code}" \
  -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  --max-time 15 \
  -d "$PAYLOAD" 2>/dev/null) || HTTP_CODE="000"

# 200 = прието; 202 = прието, ключът ще се верифицира асинхронно. И двете са успех.
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
  COUNT=$(printf '%s\n' "$URLS" | wc -l | tr -d ' ')
  echo "[indexnow] ✓ ${COUNT} URL-а подадени към Bing/Yandex/Seznam/Naver (HTTP ${HTTP_CODE})"
else
  echo "[indexnow] ⚠ ping неуспешен (HTTP ${HTTP_CODE}) — не блокира деплоя."
  [ -s "$RESP" ] && head -3 "$RESP"
fi
exit 0
