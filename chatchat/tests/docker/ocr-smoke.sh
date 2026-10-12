#!/usr/bin/env bash
# Docker smoke тест на OCR (§4.1): ИСТИНСКИТЕ pdftoppm + tesseract в крайния образ, пуснат като в
# продукция — потребител node, файлова система само за четене, /tmp като tmpfs (noexec), без мрежа,
# без Linux capabilities, без нови привилегии. Не е в `npm run gate` (иска Docker и билд на образа).
#
#   docker build -t chatchat-app .           # (или с проксито — виж DEPLOY.md)
#   bash tests/docker/ocr-smoke.sh chatchat-app
set -euo pipefail

IMAGE="${1:-chatchat-app}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker run --rm \
  --network none \
  --read-only \
  --tmpfs /tmp:size=256m,noexec,nosuid \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --memory 1g \
  --user node \
  --entrypoint node \
  -v "$HERE/ocr-smoke.mjs:/smoke/ocr-smoke.mjs:ro" \
  "$IMAGE" /smoke/ocr-smoke.mjs
