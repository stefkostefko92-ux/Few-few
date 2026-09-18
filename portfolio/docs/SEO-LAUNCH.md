# SEO · GEO · AEO — какво е в кода и какво прави собственикът след деплой

Кодът дава техническата база (гейтната в `test/build.test.mjs`); класирането идва от **регистрацията в
търсачките, Google Business профила и съдържанието**. Тук е списъкът с еднократните стъпки, които не могат да
се направят от репото, и как се мери резултатът. Дата на процедурата: 2026-09-18.

## Какво носи всяка страница (автоматично)

- `title` ≤60 · `description` 70–160 · един `h1` · canonical · hreflang bg/en/it + x-default · ≥5 ключови думи
  с „Carbon Stealth“ · Open Graph + Twitter card (собствено OG изображение за всяко демо/вертикала) · RSS link.
- JSON-LD: Organization + WebSite + ProfessionalService (geo, areaServed BG/IT, OfferCatalog) на хъба;
  Service + FAQPage + BreadcrumbList + Speakable на вертикалите; LocalBusiness-тип (AutoRepair, Restaurant…)
  на демотата; Article + FAQPage на блога; ProfessionalService + areaServed City на градските страници;
  Product/Offer на цените.
- `sitemap.xml` (162 URL, hreflang, `image:image` за превютата), `robots.txt` (AI ботове позволени),
  `llms.txt` (компания · цени · вертикали · демота), `/.well-known/security.txt`, `indexnow-key.txt`.
- Скорост: Lighthouse 95–100 (лаб., `perf/lab.json`), CLS 0, самостоятелно хостнати шрифтове.
- Достъпност: 0 грешки по `tools/a11y.mjs` (57 страници), декларация `/bg/dostapnost/`.

## Страниците, които целят търсенията

| Търсене | Страница |
|---|---|
| изработка на сайт · website design · realizzazione siti web | хъб `/bg/` `/en/` `/it/` |
| сайт за автосервиз / фитнес / салон / хотел / ресторант / клиника / адвокатска кантора / счетоводна къща / автокъща / магазин за дрехи / бързо хранене / имоти / строителна фирма · онлайн магазин | `/bg/sait-za/<slug>/` (EN `/en/website-for/`, IT `/it/sito-per/`) — 15 ×3 |
| изработка на сайт + град (Дупница · Бобов дол · София · Кюстендил · Благоевград · Перник · Милано · Болоня) | `/bg/izrabotka-na-sait/<град>/` |
| колко струва сайт 2026 · reverse charge ДДС · Lighthouse 95 · статичен сайт · хостинг в ЕС | блогът `/bg/blog/` |
| цена за изработка на сайт · онлайн магазин цена | `/bg/ceni/` + `/bg/oferta/` |

## Еднократно след деплой (собственикът)

1. **Google Search Console** — https://search.google.com/search-console → „Добавяне на собственост“ → *Домейн*
   `portfolio.carbonstealth.eu` (DNS TXT запис при регистратора) или *URL prefix* с HTML файл, качен в
   `public/` (проследен в git, за да оцелее деплой). После: *Sitemaps* → `https://portfolio.carbonstealth.eu/sitemap.xml`.
   Google **не** поддържа IndexNow — Search Console е единственият канал за бърза индексация (*URL inspection →
   Request indexing* за хъба и вертикалния индекс).
2. **Bing Webmaster Tools** — https://www.bing.com/webmasters → *Import from Google Search Console* (една
   стъпка, взима и sitemap-а). Bing захранва Copilot, DuckDuckGo и Yahoo.
3. **IndexNow** — вече автоматично: `deploy.sh` пуска `node ../tools/seo/indexnow.mjs https://portfolio.carbonstealth.eu`
   след всеки деплой (Bing · Yandex · Seznam · Naver · Yep). Ръчно: същата команда от `portfolio/`.
4. **Google Business Profile** — https://business.google.com: профил на Carbon Stealth VCC (ул. Самуил 3, Бобов дол),
   категория „Уеб дизайнер“, обслужвана зона България + Италия, уебсайт `https://carbonstealth.eu`, линк към
   портфолиото в описанието. Това е условието за картата и локалните резултати; NAP трябва да е буква по буква
   както в `ORG` (`src/lib/html.mjs`).
5. **Линкове от нашите живи сайтове** — всеки проект носи „Created and Designed by Carbon Stealth VCC“ към
   carbonstealth.eu; carbonstealth.eu да линква към `portfolio.carbonstealth.eu` (навигация или секция
   „Портфолио“). Един истински линк от домейн с история тежи повече от десет директории.

## Мерене (месечно)

```bash
cd portfolio
node ../tools/seo/gsc.mjs        # позиции/кликове от Search Console (иска credentials на сървъра, не в репото)
node ../tools/seo/cwv.mjs https://portfolio.carbonstealth.eu   # реалният PageSpeed/CrUX след пускане
node tools/perf.mjs              # лабораторни числа преди деплой (perf/lab.json)
```

Обеми на търсене: Semrush MCP е свързан, но акаунтът е без API единици (2026-09-18) — фразите по-горе са по
утвърдените търсения в бранша, не по измерени числа. При налични единици: `keyword_research` за
„изработка на сайт“ (db `bg`), „realizzazione siti web“ (`it`), „website design“ (`uk`), и коригирай
`hubKeywords`/`vertical.keywords` в `src/i18n/*.mjs` по реалните обеми.

## Какво НЕ правим

- Никакви купени линкове, директории за „SEO“, скрит текст, дублирани страници по град без реално различно
  съдържание (градските страници имат уникален текст за всеки град).
- Никакви измислени отзиви/рейтинги в JSON-LD (`aggregateRating` без реални отзиви е нарушение на правилата
  на Google за структурирани данни).
- Без бисквитки за проследяване — аналитиката, ако се добави, е server-side или privacy-first (виж root CLAUDE.md).
