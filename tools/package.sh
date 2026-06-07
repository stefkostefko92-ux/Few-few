#!/usr/bin/env bash
# Build the Chrome Web Store upload zip with only the runtime files.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
mkdir -p dist
out="dist/the-best-ads-block-$(node -p "require('./package.json').version" 2>/dev/null || echo dev).zip"
rm -f "$out"

zip -r "$out" \
  manifest.json \
  background.js theme.js \
  content.js content.css \
  cookies.js cookies.css \
  antiadblock.js antiadblock.css \
  picker.js picker.css \
  meta.js \
  youtube_main.js youtube_skip.js youtube.css \
  rules/ popup/ options/ icons/ _locales/ \
  >/dev/null

echo "Built $out"
