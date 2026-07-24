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
  `site/data/i18n/{it,en,bg}.mjs` (пълните текстове), `site/templates/*.mjs`.
- **Изход:** статични страници в корена (`index.html`, `prodotti.html`,
  `catalogo.html`, `contatti.html`, `privacy.html`, `condizioni.html`) + `en/`
  + `bg/` + `sitemap.xml` + `404.html`. **Не редактирай генерираните файлове
  ръчно** — променяй източника и пусни билда.
- **Каталог:** `docs/catalogo-staffe-panev-2026.pdf` (вграден + за сваляне);
  превюта в `img/catalogo/`.
- **Дизайн:** само каталожната палитра (`#162862`, `#1d3271`, `#f4f6f9`,
  `#e2e6ea`, `#667298`, `#878786`); Inter variable self-hosted (latin +
  cyrillic в `fonts/Inter-var-*.woff2`); без емоджита и декоративни SVG.
- **Поръчка:** списък в `localStorage` (`js/site.js`) → mailto или
  `POST /api/contact` (съществуващият бекенд с honeypot + rate limit + nodemailer).
- **server.js:** clean URLs (без `.html`, важи и за `en/`/`bg/`), 301 legacy
  редиректи от стария сайт, static + admin + contact API. Stripe кодът е
  спрян с kill-switch (`PAYMENTS_ENABLED`) и фронтът не го ползва.

## Команди (в `panev/`)

```bash
npm run build:site       # node site/build.mjs — регенерира 18-те страници + sitemap
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
