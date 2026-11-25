# tools/seo — измерване вместо мнение (SEO агент v2.0)

```bash
node tools/seo/live-check.mjs                                       # намират ли се ВСИЧКИ сайтове? (първо това)
node tools/seo/live-check.mjs mastilko-bg.com --sample 8            # един сайт, по-голяма извадка
node tools/seo/indexnow.mjs https://korpora.carbonstealth.eu        # подай страниците към Bing/Yandex/… (ключ на /indexnow-key.txt; при <key>.txt — с --key-file и --key-location)
node tools/seo/cwv.mjs https://zabobovdol.carbonstealth.eu mobile   # реални CWV (поле+лаб)
node tools/seo/check-jsonld.mjs https://zabobovdol.carbonstealth.eu # валидност на JSON-LD
node tools/seo/ai-bots.mjs /var/log/nginx/access.log               # AI обхождане + crawl-to-refer
```

- **indexnow.mjs** — изход 0 значи, че **всички** адреси от sitemap-а са подадени. Sitemap, който не
  се прочита или няма нито един `<loc>`, е изход 1 и не се подава нищо (не пада към началната
  страница); при индекс с недостъпен под-sitemap прочетеното се подава, изходът пак е 1. Само
  началната страница: `--url <сайт>/`. `--sitemap <файл>` чете локален sitemap (така подава деплоят на
  panev). `INDEXNOW_ENDPOINT` сменя адреса за подаване — тестовете сочат локален двойник.
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
- **ai-bots.mjs** — брои AI ботовете от access лога (OAI-SearchBot/GPTBot/ChatGPT-User,
  Claude-SearchBot/ClaudeBot/Claude-User, PerplexityBot, Applebot, DuckAssistBot, MistralAI-User,
  meta-externalagent, bingbot, Googlebot …) и посетителите от AI отговорите по полето Referer
  (chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com) или
  `utm_source=chatgpt.com`; смята crawl-to-refer. `Google-Extended` не е user-agent (само токен в
  robots.txt) и не се брои. Google праща само origin в Referer → AI Overviews/AI Mode се мерят с
  отчета Generative AI performance в Search Console. Списъкът — сверен 22.11.2026 (`ai-bots.test.mjs`).
- **research-2026-11.md** — проучването SEO/GEO/AEO и безплатна видимост към 22.11.2026
  (първоизточници, етикети за увереност, карта по продукт). Остарява — сверявай датираното.

⚠ Ключове/логове остават на VPS-а (mode 600), не в архива. AI-citation числата са шумни —
докладвай **тренд**, не абсолют.
