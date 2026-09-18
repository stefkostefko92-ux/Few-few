# Panev Ascensori — многоезичен сайт + ценоразпис (v3.0)

Сайт на **Panev Ascensori SAS** — италиански производител на патентовани планки
(staffe) за етажни врати и водачи на противотежестта на асансьори и товарни
асансьори (Brevetto per Modello di Utilità **UIBM N. 202023000002112**).

**v3.0 — изцяло нов сайт (2026):**

- Три езика: **италиански** (`/`), **английски** (`/en/`), **български** (`/bg/`),
  с hreflang, локализирани slug-ове и чисти URL-и без `.html`
- Промотира продажбата на планките от **каталог 2026**: пълен ценоразпис с
  всички кодове, вграден **PDF каталог** за разглеждане и сваляне
- **Поръчка по имейл** (info@panevascensori.it): списък за поръчка в
  `localStorage` → предпопълнен mailto или формата (`POST /api/contact`);
  няма количка, няма онлайн плащане
- Дизайн 1:1 по палитрата на печатния каталог (нави `#162862`/`#1d3271`,
  светло `#f4f6f9`); Inter variable self-hosted (latin + cyrillic)
- **Без бисквитки и без трекери** → без cookie банер; privacy + търговски
  условия на трите езика
- Статичен генератор без зависимости: `site/build.mjs`

## Структура

```
panev/
├── server.js                 ← Express: static + clean URLs + /api/contact + admin
├── site/                     ← ИЗТОЧНИК на сайта (генераторът)
│   ├── build.mjs             ← node site/build.mjs → 18 страници + sitemap + 404
│   ├── data/products.mjs     ← всички кодове/цени от каталога (истина)
│   ├── data/i18n/{it,en,bg}.mjs
│   └── templates/{layout,pages}.mjs
├── index.html · prodotti.html · catalogo.html · contatti.html
│   privacy.html · condizioni.html          ← генерирани (IT)
├── en/ · bg/                 ← генерирани (EN, BG)
├── docs/catalogo-staffe-panev-2026.pdf     ← каталогът (80 стр.)
├── img/                      ← продуктови изображения + img/catalogo/ превюта
├── css/site.css · js/site.js ← новият фронт
├── fonts/Inter-var-*.woff2   ← self-hosted, вкл. кирилица
├── admin/ · lib/ · scripts/  ← server-side админ (JWT), SQLite, seed
└── robots.txt · sitemap.xml · llms.txt · 404.html
```

## Команди

```bash
npm ci
npm run build:site    # регенерира сайта от site/ (след промяна по данни/текстове/шаблони)
npm run dev           # nodemon server.js (http://localhost:3000)
npm start
```

## Как се променя съдържание

1. Цени/кодове → `site/data/products.mjs` (само 1:1 с печатния каталог)
2. Текстове → `site/data/i18n/*.mjs` (паритет на ключовете в трите езика)
3. Нов каталог → замени `docs/catalogo-staffe-panev-2026.pdf` + превютата в
   `img/catalogo/`
4. `npm run build:site` → commit (генерираните файлове се комитват)

## API (запазено от v2)

| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/api/contact` | Запитване/поръчка от формата (honeypot + rate limit + nodemailer, приема и `items[]`) |
| GET | `/api/health` | Health check |
| POST | `/api/admin/*` | Server-side админ (JWT cookie + bcrypt): съобщения, легаси продукти, настройки |

## Легаси

Старият едноезичен сайт с количка/Stripe чекаут е премахнат; старите адреси
(`/servizi`, `/carrello`, `/brevetto`, `/prodotti/<id>.html` …) връщат 301 към
новите страници. Stripe кодът в `server.js` е зад kill-switch
(`PAYMENTS_ENABLED`) и не се ползва от фронта. Админ панелът (съобщения от
формата) остава на `/admin/`.

## Поддръжка

- Разработка: **Carbon Stealth VCC** — info@carbonstealth.eu
- Клиент: **Panev Ascensori SAS** — info@panevascensori.it
