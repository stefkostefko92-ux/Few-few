# tools/seo — измерване вместо мнение (SEO агент v2.0)

```bash
node tools/seo/live-check.mjs                                       # намират ли се ВСИЧКИ сайтове? (първо това)
node tools/seo/live-check.mjs mastilko-bg.com --sample 8            # един сайт, по-голяма извадка
node tools/seo/indexnow.mjs https://panevascensori.it               # подай страниците към Bing/Yandex/…
node tools/seo/cwv.mjs https://zabobovdol.carbonstealth.eu mobile   # реални CWV (поле+лаб)
node tools/seo/check-jsonld.mjs https://zabobovdol.carbonstealth.eu # валидност на JSON-LD
node tools/seo/ai-bots.mjs /var/log/nginx/access.log               # AI обхождане + crawl-to-refer
```

- **live-check.mjs** — живата проверка в реда на търсачката: DNS → http/https и www →
  началната (като Googlebot) → robots.txt → sitemap (индексите се разгръщат) → извадка от
  sitemap-а → IndexNow ключ → llms.txt. `✘` = сайтът не се намира/индексира (няма DNS,
  noindex, robots забранява, canonical към друг хост), `!` = вреди, `·` = бележка.
  `--json` за агентите, `--check` → exit 1 при `✘`. Сайтовете и ключовите им файлове са в
  **sites.mjs** — нов продукт с домейн → ред там. Само GET, нищо не подава.
- **indexnow.mjs** — подава адресите от sitemap-а (индексите се разгръщат) към IndexNow:
  едно извикване стига до Bing, Yandex, Seznam, Naver и Yep. Google не поддържа IndexNow.
- **cwv.mjs** — PageSpeed Insights API (вгражда CrUX полето — реалният ранкинг сигнал).
  За по-надеждно задай `PSI_KEY` (Google Cloud → PageSpeed Insights API).
- **check-jsonld.mjs** — извлича `application/ld+json`, JSON-парсва, докладва типове;
  бърз CI гейт (не заменя Rich Results Test).
- **ai-bots.mjs** — брои GPTBot/ClaudeBot/PerplexityBot/… от access лога и реферали от
  chatgpt/perplexity/claude; смята crawl-to-refer. GA4 е сляп за ботове — логът е истината.

⚠ Ключове/логове остават на VPS-а (mode 600), не в архива. AI-citation числата са шумни —
докладвай **тренд**, не абсолют.
