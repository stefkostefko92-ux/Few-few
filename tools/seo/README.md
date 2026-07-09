# tools/seo — измерване вместо мнение (SEO агент v2.0)

```bash
node tools/seo/cwv.mjs https://zabobovdol.carbonstealth.eu mobile   # реални CWV (поле+лаб)
node tools/seo/check-jsonld.mjs https://zabobovdol.carbonstealth.eu # валидност на JSON-LD
node tools/seo/ai-bots.mjs /var/log/nginx/access.log               # AI обхождане + crawl-to-refer
```

- **cwv.mjs** — PageSpeed Insights API (вгражда CrUX полето — реалният ранкинг сигнал).
  За по-надеждно задай `PSI_KEY` (Google Cloud → PageSpeed Insights API).
- **check-jsonld.mjs** — извлича `application/ld+json`, JSON-парсва, докладва типове;
  бърз CI гейт (не заменя Rich Results Test).
- **ai-bots.mjs** — брои GPTBot/ClaudeBot/PerplexityBot/… от access лога и реферали от
  chatgpt/perplexity/claude; смята crawl-to-refer. GA4 е сляп за ботове — логът е истината.

⚠ Ключове/логове остават на VPS-а (mode 600), не в архива. AI-citation числата са шумни —
докладвай **тренд**, не абсолют.
