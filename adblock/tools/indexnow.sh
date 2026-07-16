#!/usr/bin/env bash
# Ръчно уведоми IndexNow (Bing/Yandex/Seznam/Naver) за обновени URL адреси.
# Ключът се чете от hostнатия <key>.txt в www root. Деплоят прави това
# автоматично; този скрипт е за ръчни повторни ping-ове.
set -euo pipefail
DOMAIN="${ADBLOCK_DOMAIN:-adblock.carbonstealth.eu}"
WWW="${ADBLOCK_WWW:-/var/www/adblock}"
KEY="$(basename "$(ls "$WWW"/*.txt 2>/dev/null | grep -E '/[0-9a-f]{32}\.txt$' | head -1)" .txt 2>/dev/null || true)"
[ -n "$KEY" ] || { echo "Няма IndexNow ключ в $WWW (<key>.txt)"; exit 1; }
BASE="https://$DOMAIN"
BODY="{\"host\":\"$DOMAIN\",\"key\":\"$KEY\",\"keyLocation\":\"$BASE/$KEY.txt\",\"urlList\":[\"$BASE/\",\"$BASE/privacy\"]}"
curl -fsS -m 10 -H "Content-Type: application/json" -d "$BODY" https://api.indexnow.org/indexnow \
  && echo "IndexNow: submit OK ($KEY)"
