#!/usr/bin/env bash
# Компилира CS Anticheat скенера за Windows (single static .exe).
# Работи от всяка ОС с Go 1.25+ (cross-compile). Резултат: dist/CSAnticheat.exe
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${1:-dev}"
OUT="dist/CSAnticheat.exe"
mkdir -p dist

echo "→ компилирам CSAnticheat.exe (версия ${VERSION})"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags "-s -w -X main.build=${VERSION}" -o "${OUT}" .

echo "✓ готово: ${OUT}"
ls -la "${OUT}"
file "${OUT}" 2>/dev/null || true
