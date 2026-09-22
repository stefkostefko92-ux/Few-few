# vfr/ — V.F.R. (сайт витрина)

Едностраничен **италиански** сайт витрина за **V.F.R.** — фирма от Fino Mornasco (CO) за
„commercio rottami e metalli, sgomberi e imbiancature“. Root правилата живеят в кореновия
`CLAUDE.md`.

_Stack: **статичен** HTML/CSS/JS — без билд, без runtime зависимости. Деплой: Nginx на VPS-а
(`deploy.sh` + `nginx.conf`). Домейн (временен, до собствен): **vfr.carbonstealth.eu** — сменя се
на едно място: `grep -rl vfr.carbonstealth.eu` (HTML canonical/og/JSON-LD, sitemap, robots, llms,
security.txt, nginx.conf, deploy.sh)._

**Език на UI: италиански** (единствен). Код/коментари/commits — български.

## Структура

```
index.html          сайтът (hero, servizi ×3, come lavoriamo, perché, zona, FAQ, contatti)
privacy.html        informativa privacy (GDPR, IT); 404.html — брандирана 404 (noindex)
css/style.css       дизайн-токени в :root; css/fonts.css — self-hosted Sora + Inter (fonts/*.woff2, OFL)
js/main.js          меню · reveal (IntersectionObserver, reduced-motion) · scroll-spy · карта по клик
images/             logo.png (1024, прозрачен фон) · logo-nav.png/.webp (160) · favicon.svg + favicon-64.png · og.jpg · apple-touch-icon.png
images/photos.json  курирани безплатни снимки (Unsplash/Pexels) със страница-източник + автор
images/photos/      свалените снимки (jpg+webp) — пълни се от tools/fetch-photos.mjs
tools/              fetch-photos.mjs (сваля+оптимизира+вгражда) · render-og.mjs (og.jpg през Chromium)
llms.txt · robots.txt · sitemap.xml · indexnow-key.txt · .well-known/security.txt
nginx.conf · deploy.sh   сървърна конфигурация (в репото, не на ръка)
```

## Снимки (важно)

Трите услуги носят **реални снимки** (`images/photos/`, 1024×666 + 640 вариант, jpg+webp) от
**Open Images V7** (Google) — оригинали от Flickr под **CC BY 2.0**: атрибуцията във футъра
(„Foto dei servizi (ritagliate): …“) е **задължителна по лиценз**, не я махай. Източник на
свалянето: `open-images-dataset.s3.amazonaws.com` (единственият фото-хост, който egress policy-то
на средата пуска; Unsplash/Pexels/Wikimedia са 403). Кои са: `images/photos.json` → `used`.
Hero-то е логото. Слотовете `<!-- photo:rottami|sgomberi|imbiancature -->` остават — ако
собственикът предпочете Unsplash/Pexels избора от `slots`, там, където мрежата позволява:

```bash
cd vfr && npm i && npm run photos:apply   # сваля → images/photos/ → <picture> (замества текущите; махни кредитите)
npm run check                             # гейтът трябва да остане зелен
```

Лицензи: Unsplash License / Pexels License (търговска употреба, без атрибуция). Алтернативи за
всеки слот са в `photos.json`. Нови снимки: добави запис с `page` + `author` — **не измисляй ID-та**.

## Реални данни (не измисляй)

- Ритиро на скрап/метали: **в цяла Италия**; **собствен склад** на адреса на седалището. Sgomberi/imbiancature: Como, Milano и големите градове в Северна Италия (по искане на собственика — не малки общини).
- Адрес: Via Monte Grappa 6, 22073 Fino Mornasco (CO) · тел. +39 377 442 3899 · vicino.franco74@gmail.com
- Гео: 45.74611, 9.04996 (улицата по Tuttocittà; уточни до номера при собствен Maps pin).
- **Неизвестни — да се потвърдят със собственика преди пускане:** работно време (затова няма
  `openingHours` в JSON-LD), P.IVA/ragione sociale (маркирано в `privacy.html`), дали номерът
  има WhatsApp (линкът `wa.me` е сложен, защото номерът е мобилен).

## Бранд

Логото е дадено от собственика (кръгъл емблем: багер с грайфер, „V.F.R.", трите услуги). Палитрата на
сайта е извадена от него: **черно `#050505` · червено `#d8100f`/`#f0262b` · бяло `#f7f7f7`**, стомана само за
илюстрациите. Токените са в `css/style.css` (`--red`, `--red-2`, `--red-soft`, `--ink`, `--paper`). Варианти:
`logo.png` (hero, JSON-LD), `logo-nav` (навигация/футър), `apple-touch-icon` и `favicon-64` (върху черно) —
генерират се от оригинала с sharp (прозрачен фон = почти-черното → alpha), не се редактират на ръка.

## Конвенции

- **Без билд, без зависимости** в рантайм; `devDependencies` (sharp, playwright-core) са само за
  `tools/`. Редактирай HTML/CSS/JS директно.
- Всяка страница: `<meta name="keywords">` ≥5 с „Carbon Stealth“, уникален title/description,
  canonical + hreflang (it + x-default), JSON-LD в `@graph`.
- JSON-LD в `index.html` (`LocalBusiness`, `WebSite`, `WebPage`+`speakable`, `BreadcrumbList`,
  `Service`×3, `HowTo`, `FAQPage`) е **в синхрон с видимия текст** — FAQ/стъпки се променят на две места.
- Картата на Google се зарежда **само след клик** (нула заявки преди съгласие) → няма банер за бисквитки.
- Reveal анимациите са само с `.js` клас и падат при `prefers-reduced-motion`.
- SEO промяна → `node tools/seo/indexnow.mjs https://vfr.carbonstealth.eu` (ключът е на `/indexnow-key.txt`).

## Гейт

```bash
node tools/qa/static-site-check.mjs vfr                 # от корена на репото (CI: .github/workflows/vfr.yml)
node tools/seo/check-jsonld.mjs vfr/index.html
node tools/seo/prelaunch-audit.mjs vfr --min 90          # Lighthouse-съвместим лаб одит (иска playwright-core)
```
