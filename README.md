# Few-few — World Cup 2026 "Top 10 Landmarks" YouTube Series

Ready-to-record video scripts for a YouTube series covering the **Top 10
landmarks of every nation playing at the FIFA World Cup 2026** (hosted by the
USA, Canada and Mexico).

Each episode is one country. Scripts are written in **English**, formatted as a
voice-over countdown (10 → 1), and include everything you need to produce and
publish the video: title options, SEO description, tags, thumbnail text,
chapter timestamps and the full narration.

## Repository layout

One folder per country (= one video). Each folder holds that episode's script
and, once generated, its voiceover.

```
.
├── README.md           # this file
├── INDEX.md            # full 48-team field + production status
├── TEMPLATE.md         # the canonical script structure — copy for new episodes
├── VOICEOVER.md        # the series voice + how to generate it
├── tools/
│   └── generate_voiceover.py   # script.md → voiceover.mp3 (ElevenLabs)
└── clips/
    ├── mexico/
    │   ├── script.md           # title, description, tags, full narration
    │   └── voiceover.mp3        # generated (git-ignored)
    ├── usa/
    │   └── script.md
    └── ...                      # one folder per nation (39 ready)
```

## How to make an episode

1. Open `clips/<country>/script.md`.
2. Generate the voice-over: `python tools/generate_voiceover.py clips/<country>`
   (see [VOICEOVER.md](VOICEOVER.md)) — or record it yourself.
3. Pair each landmark with B-roll / stock footage (suggested shots are noted).
4. Copy the **Title**, **Description** and **Tags** straight into YouTube.
5. Use the **Chapters** block in the description to enable YouTube chapters.

## Production notes

- **Footage:** every landmark line notes the kind of shot to look for. Use
  licensed stock (Pexels, Pixabay, Storyblocks) or Creative Commons clips —
  always check the licence before publishing.
- **Length target:** 8–10 minutes (the countdown format keeps retention high).
- **Pacing:** ~40–60 seconds per landmark, plus intro and outro.
- **Consistency:** keep the same intro/outro structure across all episodes so
  the series feels like a brand.

## Roadmap

- [x] **All 48 episodes ready** — the complete World Cup 2026 field 🎉
  - Hosts (3), CONMEBOL (6), UEFA (16), CAF (9), AFC (8), CONCACAF (3), OFC (1),
    intercontinental play-off winners (2)

See [INDEX.md](INDEX.md) for the full field and per-nation status.
