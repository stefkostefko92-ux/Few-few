# panev/ — Panev Ascensori (многоезичен сайт + ценоразпис)

Изцяло нов (2026) сайт на **Panev Ascensori SAS** — италиански производител на
патентовани планки (it: staffe) за етажни врати и водачи на противотежестта
(UIBM N. 202023000002112). **Три езика: италиански (корен `/`), английски
(`/en/`), български (`/bg/`).** Продажбата е **B2B, поръчка по имейл**
(info@panevascensori.it) — няма количка, няма онлайн плащане, няма бисквитки.
Кореновите правила са в репо-root `CLAUDE.md`.

_Stack: Node.js **plain JS** · Express (сервиране + `/api/contact`) · SQLite
(само admin съобщения/архив) · статичен генератор без зависимости._

## Как е устроен сайтът

- **Източник:** `site/` — `site/build.mjs` (генератор), `site/data/products.mjs`
  (всички кодове/цени от каталога — единствен източник на истината),
  `site/data/i18n/{it,en,bg}.mjs` (пълните текстове, разделени по страници в
  `i18n/<език>/{common,home,products,pages,legal}.mjs`), `site/templates/*.mjs`.
  `site/data` беше извън git (стар `.gitignore` с `data/`) и е възстановен от
  генерираните страници: билдът ги възпроизвеждаше байт по байт.
- **Изход:** статични страници в корена (`index.html`, `prodotti.html`,
  `catalogo.html`, `contatti.html`, `privacy.html`, `condizioni.html`) + `en/`
  + `bg/` + `sitemap.xml` + `404.html`. **Не редактирай генерираните файлове
  ръчно** — променяй източника и пусни билда.
- **Каталог:** `docs/catalogo-staffe-panev-2026.pdf` (вграден + за сваляне);
  превюта в `img/catalogo/`. 95 страници, 10 MB: 68-те на каталога плюс 27 страници „Vista 3D“
  с рендерите. Правят се с `cd 3d && npm run catalog-pdf`, никога на ръка.
- **Дизайн:** само каталожната палитра (`#162862`, `#1d3271`, `#f4f6f9`,
  `#e2e6ea`, `#667298`, `#878786`); Inter variable self-hosted (latin +
  cyrillic в `fonts/Inter-var-*.woff2`); без емоджита и декоративни SVG.
- **Стилове:** `css/site.css` е общото. Новото е в отделни файлове, само където
  трябва: `css/vista-3d.css` (3D рендерите и 3D изгледа — начална и продукти) и
  `css/listino.css` (таблиците в продуктовите карти на тясно, container queries).
  Линковете с `?v=<хеш>` ги слага `site/build.mjs`. Менюто се свива в бутон под
  1180 px — българските надписи са най-дългите и не се събират по-тясно.
- **Поръчка:** списък в `localStorage` (`js/site.js`) → mailto или
  `POST /api/contact` (съществуващият бекенд с honeypot + rate limit + nodemailer).
- **server.js:** clean URLs (без `.html`, важи и за `en/`/`bg/`), 301 legacy
  редиректи от стария сайт, static + admin + contact API. Stripe кодът е
  спрян с kill-switch (`PAYMENTS_ENABLED`) и фронтът не го ползва.

## 3D каталог (`3d/`)

Отделен пакет със собствени зависимости и гейт. Той съдържа параметрични модели от ламарина за
всичките 48 артикула от каталога, сглобки A+B и опора+SG+водач, фотореалистичен WebGPU рендер и
интерфейс IT/EN/BG. Страницата е статична и самостоятелна: `dist/staffe-3d.html` + `.js` +
`tex/`, без CDN. Рендерите са в `3d/renders/`.

Детайлите са в `3d/CLAUDE.md` и `3d/README.md`. Гейт: `cd 3d && npm run gate`. CI:
`.github/workflows/panev-3d.yml`.

**3D в сайта.**
- **Страници:** `/staffe-3d`, `/en/brackets-3d`, `/bg/planki-3d` — визьорът в собствен документ
  (`site/templates/viewer.mjs`, без `site.css`), с canonical, hreflang, OG, JSON-LD и sitemap.
  Маркировката и стилът идват от `3d/template.html`, статичните текстове — от `3d/src/ui/i18n.js`.
- **Начална страница:** секция „Vista 3D“ (`#vista-3d`) с постер; на широк екран кликът го сменя
  с визьора в рамка (`?embed=1`), на тесен отваря 3D страницата. Преди клика не се тегли нищо от 3D.
- **Снимки:** продуктите и началната страница показват 3D рендерите от `img/3d/` (WebP 480/960,
  JPEG 960). Изрязаните от каталога картинки са махнати; `img/staffa-*` остават, защото ги ползва
  админът (сийдът в `scripts/seed.js`).
- **Ред:** `cd 3d && npm run site` (бъндъл + текстури → `3d-viewer/`, снимки → `img/3d/`,
  `img/og-3d.jpg`), после `npm run build:site`. И двете папки се комитват — деплоят е rsync.
- **server.js:** `frame-src 'self'` е за рамката; `/3d/` (изходният пакет) и `DEPLOY.md` не се
  сервират.

## Команди (в `panev/`)

```bash
npm run build:site       # node site/build.mjs — регенерира 21-те страници (18 + три 3D) + sitemap
npm run dev              # nodemon server.js
npm start                # node server.js
npm run db:seed          # node scripts/seed.js (admin/legacy данни)
```

## Конвенции (важно)

- **Plain JavaScript**, без build step освен `build:site`; ESM в `site/`.
- **Продуктовите данни се пипат само в `site/data/products.mjs`** и трябва да
  съвпадат 1:1 с печатния каталог (кодове, размери, цени IVA esclusa).
- **i18n паритет:** трите файла в `site/data/i18n/` имат еднаква структура на
  ключовете; italiano е източникът на продуктовата терминология (от каталога),
  EN следва EN 81, BG — асансьорния жаргон („планка“, „етажна врата“,
  „водачи на противотежестта“). Кодове/размери/цени не се превеждат.
- **SEO:** всяка страница ≥5 ключови думи, една винаги „Carbon Stealth“;
  hreflang it/en/bg + x-default; при промяна по страници/sitemap → IndexNow
  (`node tools/seo/indexnow.mjs https://panevascensori.it`).
- **Правно:** сайтът е без бисквитки/трекери — не добавяй такива без банер за
  съгласие и обновена informativa; формата изисква privacy checkbox (GDPR
  чл. 13). Правен изход завършва с „не е правен съвет“.
- **Тайни** (SMTP, JWT) само в `.env` (виж `.env.example`), никога в репото.
