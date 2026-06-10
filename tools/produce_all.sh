#!/usr/bin/env bash
# Render every episode to a YouTube-ready MP4 with tools/produce.py.
#
#   export ELEVENLABS_API_KEY=...   # Charlotte voice (optional)
#   export PEXELS_API_KEY=...       # auto footage   (optional)
#   export MUSIC=assets/music/bed.mp3   # background track (optional)
#   tools/produce_all.sh            # → out/<country>.mp4 for all 48
#   tools/produce_all.sh --res 4k
set -euo pipefail
cd "$(dirname "$0")/.."

RESARG="${1:-}"; VAL="${2:-}"
for dir in clips/*/; do
  name="$(basename "$dir")"
  if [[ -f "out/${name}.mp4" ]]; then echo "↳ skip ${name} (already rendered)"; continue; fi
  echo "════════ ${name} ════════"
  python3 tools/produce.py "$dir" all ${RESARG:+$RESARG} ${VAL:+$VAL}
done
echo "All done → out/"
