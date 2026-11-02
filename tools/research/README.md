# tools/research — YouTube и Reddit за проучване (умение `youtube-reddit`)

Нула зависимости, само официални API. Процедурата и предпазителите са в
[`.claude/skills/youtube-reddit/SKILL.md`](../../.claude/skills/youtube-reddit/SKILL.md).

| Файл | Какво |
|---|---|
| `sources.mjs` | Чисти функции: плик за недоверено съдържание, парсване на id/URL, нормализация без имена, API клиенти |
| `yt.mjs` | `search` · `video` · `comments` през YouTube Data API v3 (`YOUTUBE_API_KEY`) |
| `reddit.mjs` | `top` · `search` · `thread` през Reddit Data API — само с одобрен OAuth app |
| `sources.test.mjs` | Договорът (без мрежа) |

```bash
node --test tools/research/sources.test.mjs
YOUTUBE_API_KEY=… node tools/research/yt.mjs search "fivem mlo" --max 10 --order relevance
```

Какво умишлено НЯМА:
- **Транскрипт на чужди видеа.** `yt-dlp` и всеки друг път извън API нарушават Условията на YouTube.
  Наши видеа → `captions.download` с OAuth (за бъдеще).
- **Публичен Reddit `.json`, scraping, бисквитки, вход, прокси.**
- **Агрегиране или класации през канали от YouTube API данни.**

Решения на собственика преди първото реално ползване:
- одобрение от Reddit по Responsible Builder Policy (за търговска цел — писмено);
- тест за баланс на легитимния интерес;
- ред в регистъра на дейностите;
- раздел в политиката за поверителност по чл. 14(5)(b).
