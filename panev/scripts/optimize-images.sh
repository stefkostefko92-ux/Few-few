#!/bin/bash
# ============================================================
#  PANEV — Batch WebP converter
#  Converts all PNG/JPG in img/ to WebP (Q85) alongside originals.
#  Originals are kept so <picture> fallbacks work.
#
#  Usage: bash scripts/optimize-images.sh
# ============================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
IMG_DIR="img"
Q=85

if ! command -v convert >/dev/null; then
  echo "✗ ImageMagick 'convert' non trovato. Install: apt install imagemagick"
  exit 1
fi

# Stats
ORIGINAL=0
OPTIMIZED=0
SKIPPED=0
COUNT=0

for f in "$IMG_DIR"/*.png "$IMG_DIR"/*.jpg "$IMG_DIR"/*.jpeg; do
  [ -e "$f" ] || continue
  webp="${f%.*}.webp"

  # Skip if WebP already exists and is newer than source
  if [ -e "$webp" ] && [ "$webp" -nt "$f" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  convert "$f" -quality $Q "$webp" 2>/dev/null

  orig_size=$(stat -c%s "$f")
  new_size=$(stat -c%s "$webp")
  ORIGINAL=$((ORIGINAL + orig_size))
  OPTIMIZED=$((OPTIMIZED + new_size))
  COUNT=$((COUNT + 1))

  if (( orig_size > 0 )); then
    saved=$((100 - new_size * 100 / orig_size))
    printf "  %s → %s  %dK→%dK  (-%d%%)\n" "$(basename $f)" "$(basename $webp)" \
           "$((orig_size/1024))" "$((new_size/1024))" "$saved"
  fi
done

echo ""
echo "──────────────────────────────────────────"
echo "  Processed: $COUNT images"
echo "  Skipped (already up-to-date): $SKIPPED"
if (( ORIGINAL > 0 )); then
  saved_kb=$(( (ORIGINAL - OPTIMIZED) / 1024 ))
  saved_pct=$(( 100 - OPTIMIZED * 100 / ORIGINAL ))
  echo "  Total before: $((ORIGINAL/1024))K"
  echo "  Total after:  $((OPTIMIZED/1024))K"
  echo "  Saved:        ${saved_kb}K (${saved_pct}% reduction)"
fi
echo "──────────────────────────────────────────"
