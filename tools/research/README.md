# tools/research — YouTube и Reddit за проучване (умение `youtube-reddit`)

Нула зависимости, само официални API. Процедурата и предпазителите са в
[`.claude/skills/youtube-reddit/SKILL.md`](../../.claude/skills/youtube-reddit/SKILL.md).

| Файл | Какво |
|---|---|
| `sources.mjs` | Чисти функции: плик за недоверено съдържание, парсване на id/URL, нормализация без имена, API клиенти |
| `yt.mjs` | `search` · `video` · `comments` през YouTube Data API v3 (`YOUTUBE_API_KEY`) |
| `reddit.mjs` | `top` · `search` · `thread` през Reddit Data API — само с одобрен OAuth app |
| `sources.test.mjs` | Договорът (без мрежа) |
| `video-notes.mjs` | „Гледа“ видео **локално**: листове с кадри (ffmpeg) + транскрипт (faster-whisper по избор) — само наш файл, файл от автора или с писмено разрешение |
| `video-notes.test.mjs` | Договорът му: отказ на адрес, задължителен `--source`, нищо в репото, плик |

```bash
node --test tools/research/sources.test.mjs
YOUTUBE_API_KEY=… node tools/research/yt.mjs search "fivem mlo" --max 10 --order relevance
```

Видео, което имаме законно (наш запис, файл от автора, писмено разрешение):

```bash
node tools/research/video-notes.mjs ~/Downloads/reel.mp4 --source author \
  --whisper ~/venvs/asr/bin/python   # venv с `pip install faster-whisper`; без него — само кадрите
```

Изходът (листове с кадри, звук) е **извън репото** (по подразбиране временна папка). Транскриптът е в
плика „недоверено съдържание“. Поука или умение от него минава през човек (`skill-author`), никога
автоматично: „направи от видеото умение“ превръща чужд текст в постоянни инструкции. Суровото се трие
след бележките. В репото влизат само перифразирани изводи.

Какво умишлено НЯМА:
- **Транскрипт на чужди видеа.** `yt-dlp` и всеки друг път извън API нарушават Условията на YouTube.
  Наши видеа → `captions.download` с OAuth (за бъдеще).
- **Публичен Reddit `.json`, scraping, бисквитки, вход, прокси.**
- **Агрегиране или класации през канали от YouTube API данни.**

Решения на собственика преди първото реално ползване — черновите са в [`legal/`](legal/README.md)
(Правния Разбирач, 02.11.2026), за попълване и подпис:
- тест за баланс на легитимния интерес (`legal/LIA.md`);
- ред в регистъра на дейностите (`legal/ROPA.md`);
- раздел в политиката за поверителност по чл. 14(5)(b) (`legal/privacy-section.md`);
- `YOUTUBE_API_KEY` по `legal/youtube-key.md`;
- Reddit: първо дали приемът на заявки е още отворен (по вторичен източник е затворен от 31.10.2026),
  после писмено одобрение по Responsible Builder Policy (`legal/reddit-application.md`).
