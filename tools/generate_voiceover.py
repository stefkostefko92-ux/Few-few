#!/usr/bin/env python3
"""Generate a voiceover MP3 from a country's script.md using ElevenLabs.

Usage:
    export ELEVENLABS_API_KEY=your_key_here
    python tools/generate_voiceover.py clips/mexico
    python tools/generate_voiceover.py clips/mexico --voice Charlotte

It reads the "## Narration" section of <folder>/script.md, removes the
*B-roll: ...* stage directions and the markdown headings, then synthesises
<folder>/voiceover.mp3 with a single, consistent series voice.

Stdlib only — no pip install required.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Keep these IDENTICAL across every episode for a consistent series voice.
# Public ElevenLabs voice IDs (premade library):
VOICES = {
    "Jessica": "cgSgspJ2msm6clMCkdW9",   # ⭐ recommended — young, expressive
    "Charlotte": "XB0fDUnXU5powFXDhCwa",  # warm, cinematic
    "Sarah": "EXAVITQu4vr4xnSDxMaL",      # calm, documentary
    "Matilda": "XrExE9yKIg1WjnnlVkGX",    # friendly, warm
    "Alice": "Xb7hH8MSUJpSbSDYk0k2",      # clear British
}

MODEL_ID = "eleven_multilingual_v2"
VOICE_SETTINGS = {
    "stability": 0.45,
    "similarity_boost": 0.80,
    "style": 0.40,
    "use_speaker_boost": True,
}


def extract_narration(script_md: str) -> str:
    """Pull the Narration section and clean it into pure spoken text."""
    # Grab everything under "## Narration" up to the next top-level "## " heading.
    m = re.search(r"^##\s+Narration.*?$(.*?)(?=^##\s|\Z)", script_md,
                  flags=re.MULTILINE | re.DOTALL)
    body = m.group(1) if m else script_md

    section_labels = {"intro", "outro", "honourable mentions",
                      "honourable mentions & outro"}
    lines = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("*B-roll") or line.startswith("*(") or line == "---":
            continue  # stage directions / notes
        if re.sub(r"^#+\s*", "", line).strip().lower() in section_labels:
            continue  # bare section labels are not spoken
        line = re.sub(r"^#+\s*", "", line)          # drop "### #10 — Landmark"
        line = re.sub(r"[*_`]", "", line)           # drop markdown emphasis
        if line.startswith("#") and "—" in line:    # section label like "#10 — X"
            # keep the landmark name as a spoken cue is optional; skip the label.
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def synthesize(text: str, voice_id: str, out_path: Path, api_key: str) -> None:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = json.dumps({
        "text": text,
        "model_id": MODEL_ID,
        "voice_settings": VOICE_SETTINGS,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST", headers={
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            out_path.write_bytes(resp.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs API error {e.code}: {e.read().decode(errors='replace')}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("folder", help="country folder, e.g. clips/mexico")
    ap.add_argument("--voice", default="Jessica", choices=sorted(VOICES),
                    help="series voice (default: Jessica)")
    ap.add_argument("--dry-run", action="store_true",
                    help="write the cleaned narration to narration.txt, skip the API")
    args = ap.parse_args()

    folder = Path(args.folder)
    script = folder / "script.md"
    if not script.exists():
        sys.exit(f"Not found: {script}")

    narration = extract_narration(script.read_text(encoding="utf-8"))
    if not narration:
        sys.exit(f"No Narration section found in {script}")

    (folder / "narration.txt").write_text(narration, encoding="utf-8")
    print(f"✓ narration → {folder / 'narration.txt'} ({len(narration)} chars)")

    if args.dry_run:
        return

    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        sys.exit("Set ELEVENLABS_API_KEY to generate audio (or use --dry-run).")

    out = folder / "voiceover.mp3"
    synthesize(narration, VOICES[args.voice], out, api_key)
    print(f"✓ voiceover → {out}  (voice: {args.voice})")


if __name__ == "__main__":
    main()
