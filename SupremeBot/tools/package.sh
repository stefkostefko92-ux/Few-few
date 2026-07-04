#!/usr/bin/env bash
# Build a Chrome Web Store zip containing ONLY the extension files.
# Excludes controller/, server/, tools/ (incl. genkey.mjs!), screenshots/, docs, .git.
#
# Usage: bash tools/package.sh   ->   dist/tanoth-master-bot-<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/tanoth-master-bot-${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"

# Only these paths ship to the store.
INCLUDE=(manifest.json icons _locales popup options stats src/shared src/core src/content src/background src/ui src/modules)

# Guard: the signing secret / key generator must never be in the package.
if [ -d tools ] && printf '%s\n' "${INCLUDE[@]}" | grep -q '^tools$'; then
  echo "REFUSING: tools/ would be packaged (contains genkey + secret)"; exit 1
fi

zip -r -q "$OUT" "${INCLUDE[@]}" \
  -x '*/.DS_Store' '*/node_modules/*'

echo "Built $OUT"
echo "Contents:"; unzip -l "$OUT" | tail -n +2 | head -40
echo
echo "Reminder: confirm src/shared/payment.js has YOUR LICENSE_SECRET (not the shipped default) before publishing."
