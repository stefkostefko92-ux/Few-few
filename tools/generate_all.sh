#!/usr/bin/env bash
# Generate voiceovers for every episode in clips/ with the series voice.
#
# Usage:
#   export ELEVENLABS_API_KEY=your_key_here
#   tools/generate_all.sh            # generate voiceover.mp3 for all nations
#   tools/generate_all.sh --dry-run  # just write narration.txt, no API calls
#
# Re-running skips folders that already have a voiceover.mp3 (unless --dry-run).
set -euo pipefail

cd "$(dirname "$0")/.."
EXTRA="${1:-}"

for dir in clips/*/; do
  name="$(basename "$dir")"
  if [[ "$EXTRA" != "--dry-run" && -f "${dir}voiceover.mp3" ]]; then
    echo "↳ skip ${name} (voiceover.mp3 exists)"
    continue
  fi
  echo "▶ ${name}"
  python3 tools/generate_voiceover.py "$dir" ${EXTRA:+$EXTRA}
done

echo "Done."
