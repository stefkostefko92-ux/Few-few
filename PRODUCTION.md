# Production — render YouTube-ready MP4s

`tools/produce.py` turns any `clips/<country>/script.md` into a finished, 1080p,
upload-ready video with the **Charlotte** voiceover, auto-sourced stock footage,
animated `10 → 1` numbers, name lower-thirds, burned-in subtitles and a ducked
music bed — plus a `.srt` and a `.description.txt` with **real** chapter
timestamps (computed from the actual audio, not estimates).

> ⚠️ This runs **on your machine**, not in the cloud session — rendering needs
> `ffmpeg` and internet access for the voice/footage APIs, which the web session
> doesn't have. Everything is built so one command does the whole job locally.

---

## 1. Install prerequisites (one time)

- **ffmpeg** (required) — the video engine:
  - macOS: `brew install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg` (or [ffmpeg.org](https://ffmpeg.org))
  - Linux: `sudo apt install ffmpeg`
- **Python 3.10+** (you already have it).

Check everything at once:
```bash
python3 tools/produce.py check
```

## 2. Get the API keys (free tiers exist)

| Key | What it does | Where | Without it |
|-----|--------------|-------|------------|
| `ELEVENLABS_API_KEY` | the **Charlotte** voiceover | elevenlabs.io | falls back to your OS voice (macOS `say` / `espeak`), or silent + subtitles |
| `PEXELS_API_KEY` | auto-downloads stock **video** per landmark | pexels.com/api (free) | put your own clips in `clips/<country>/assets/00.mp4`, `01.mp4`, … |

```bash
export ELEVENLABS_API_KEY=your_key
export PEXELS_API_KEY=your_key
export MUSIC="$HOME/music/upbeat_bed.mp3"   # optional background track
```

Free music for the bed: the **YouTube Audio Library**, Pixabay Music, or
Uppbeat — always check the licence before monetising.

## 3. Render

One episode:
```bash
python3 tools/produce.py clips/mexico --all
# → out/mexico.mp4   out/mexico.srt   out/mexico.description.txt
```

All 48 at once:
```bash
tools/produce_all.sh
```

4K instead of 1080p:
```bash
python3 tools/produce.py clips/mexico --all --res 4k
```

## 4. What you get, per episode

```
out/
├── mexico.mp4              # 1080p H.264, AAC, +faststart — ready to upload
├── mexico.srt             # upload as captions on YouTube
└── mexico.description.txt  # title + description + REAL chapter timestamps + tags
```

## 5. How it works (the stages)

| Stage | Does |
|-------|------|
| `segment` | parses the script into intro → 10…1 → mentions → outro |
| `voice`   | narrates each segment (Charlotte / OS voice / silent) → `build/audio/NN.mp3` |
| `footage` | one clip per segment from Pexels (or your `assets/NN.mp4`) → `build/footage/` |
| `render`  | ffmpeg: fill + slow zoom + rank badge + lower-third + subtitles + music → `out/` |

Run any stage alone, e.g. just fetch footage:
`python3 tools/produce.py clips/mexico footage`

Re-running skips work that's already done (cached voice/footage), so it's cheap
to iterate. Delete `clips/<country>/build/` to force a clean rebuild.

## 6. Upload checklist

1. Upload `out/<country>.mp4`.
2. Paste `out/<country>.description.txt` into the title + description (chapters
   activate automatically — they're real timestamps).
3. Upload `out/<country>.srt` under Subtitles.
4. Make a thumbnail using the concept noted at the top of `script.md`.

## Troubleshooting

- **"ffmpeg not found"** → install it (step 1), reopen the terminal.
- **Voice is silent** → no `ELEVENLABS_API_KEY` and no OS voice engine; the video
  still renders with subtitles. Add the key for the real Charlotte track.
- **Few/no footage clips** → no `PEXELS_API_KEY`; drop your own clips into
  `clips/<country>/assets/` named `00.mp4`, `01.mp4` … matching segment order
  (see `build/segments.json`).
- **Fonts look wrong** → `export FONT=/path/to/a/bold.ttf`.
