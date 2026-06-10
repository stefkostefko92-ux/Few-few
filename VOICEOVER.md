# Voiceover — the series voice

A consistent, "addictive" narration voice is what turns a list of facts into a
binge-watchable series. Pick **one** female voice and use it for **every** episode
so the channel builds a recognisable identity.

## ⭐ Series voice — CHOSEN: "Charlotte"

**ElevenLabs — "Charlotte"** (warm, smooth, slightly alluring) — this is the
locked-in voice for every episode.
- Why: a rich, cinematic, faintly seductive delivery that makes the travel
  footage feel premium and keeps viewers leaning in — addictive without being
  over-the-top. It's the default in `tools/generate_voiceover.py`.
- Model: `eleven_multilingual_v2` (best quality) or `eleven_turbo_v2_5` (cheaper/faster).
- Suggested settings:
  - **Stability:** 45% (enough variation to stay lively, not so much it wobbles)
  - **Similarity:** 80%
  - **Style exaggeration:** 35–45% (adds the "hook" energy — don't overdo it)
  - **Speaker boost:** on
  - **Speed:** 1.0–1.05

> Tweak to taste: for an even calmer, more cinematic read, drop Style to ~25%.
> For a touch more energy, nudge Style toward 50%.

## Alternatives (same provider)

| Voice | Character | Best for |
|-------|-----------|----------|
| **Jessica** | Young, punchy, expressive | A higher-energy, social-media feel |
| **Sarah** | Calm, soft, documentary | A relaxing "fall-asleep travel" vibe |
| **Matilda** | Friendly, warm, natural | Approachable, mass-appeal narration |
| **Alice** | Clear British English | If you prefer a UK accent |

> Tip: generate the **same 30-second sample** (e.g. the Mexico intro + landmark #10)
> with 2–3 of these and pick the one you can't stop listening to. That's your
> series voice — lock it in.

## Free / lower-cost options

- **Microsoft Azure Neural TTS** — voices `en-US-AriaNeural` or `en-US-JennyNeural`
  (very natural, generous free tier).
- **Google Cloud TTS** — the `Journey` / `Studio` female voices are excellent.
- **OpenAI TTS** — voice `nova` (bright, engaging female).

All of these are commercially licensable for YouTube — always confirm the current
licence terms of whichever provider you choose before monetising.

## How to generate

A ready-to-run helper is in [`tools/generate_voiceover.py`](tools/generate_voiceover.py).
It extracts the **Narration** section from a country's `script.md`, strips the
`*B-roll: ...*` stage directions, and produces an `voiceover.mp3` in the same
folder using ElevenLabs.

```bash
export ELEVENLABS_API_KEY=your_key_here
python tools/generate_voiceover.py clips/mexico
# → writes clips/mexico/voiceover.mp3
```

Keep the chosen `VOICE_ID` and settings identical across all episodes for a
consistent brand.
