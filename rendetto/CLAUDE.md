# CLAUDE.md — Rendetto

Програма в браузъра за проектиране на корпусни мебели: от един проект — 3D модел, разкрой с кантиране,
обков, чертежи с карта за пробиване и файлове за CNC (DXF на слоеве, G-code ISO/Fanuc и GRBL). С акаунти,
30-дневен тестов период, ръчни планове (Premium/Lifetime) и админ панел. Самостоятелен продукт —
`cd rendetto/` за всичко. Домейн: rendetto.carbonstealth.eu (порт 4320).

## Стек

Node ≥22 · TypeScript strict (ESM, `NodeNext`) · Express 5 · EJS (сървърно рендирани страници, строг
CSP с nonce, `style-src-attr 'none'`) · Prisma 6 + PostgreSQL · zod на всеки външен вход · pino (без
PII) · Argon2id · TOTP (RFC 6238, без зависимости) · DB-IP Lite за държава по IP. Двигателят
(`engine/`, обикновен ESM JS) е общ за сървъра и редактора; редакторът (`editor/`) се събира с
esbuild заедно с three.js в `public/editor/` — без CDN. Фотореалистичният изглед (three-gpu-pathtracer +
three-mesh-bvh) е отделно парче в `public/editor/chunks/`, зарежда се само при натискане на бутона.

## Команди (гейтът)

```bash
npm ci
npm run typecheck        # tsc над src + tests
npm run format:check     # prettier (= npm run lint)
npm test                 # unit (node:test през tsx) — без база
npm run test:engine      # двигателят: всички видове мебели, изходи, G-code, DXF (ezdxf, ако го има)
npm run build            # prisma generate + tsc + редакторът
npm run test:integration # иска жива PostgreSQL (TEST_DATABASE_URL или локалната rendetto_test)
npm run dev              # локален сървър на :4320
npm run owner:create     # първият собственик — OWNER_EMAIL/OWNER_NAME/OWNER_PASSWORD от средата
npm run geoip:update     # DB-IP Lite → data/dbip-country-lite.mmdb (месечно)
node scripts/og-image.mjs # public/img/og.png — ръчно, след промяна на вида или двигателя
npm run brochure         # print/rendetto-brochure-<език>.pdf — брошурата A4 за клиенти (print/README.md)
```

## Подредба

```
src/
  config.ts           zod схема на средата (процесът не тръгва с полуготов конфиг)
  server.ts           helmet/CSP, реда на рутерите, грешките
  auth/               пароли, TOTP, сесии в базата, устройство (HWID), GeoIP, RBAC, CSRF guards
  services/           бизнес логиката (регистрация, вход, сигурност, админ, проекти, изходи)
  routes/             тънки рутери: валидиране → услуга → изглед
  plans/              ценоразпис (цели центове) и състояние на плана
  seo/                JSON-LD
engine/               двигателят (модел, разкрой, пробиване, CAM, DXF, чертежи)
editor/               UI на редактора (браузър); 3D: viewer.js (сцена) · viewer-render.js (AO + натрупване, докато
                      камерата стои) · viewer-studio.js (студио, ключова светлина) · viewer-photo.js (path tracing)
                      · tex-*.js (декорите се „изпичат“ процедурно на видеокартата: цвят, релеф, грапавост)
views/                EJS: landing/, legal/ (съдържанието по език в legal/<страница>/<език>.ejs),
                      auth/, app/, account/, admin/, partials/
locales/<език>/       common · auth · account · admin · mail · editor · landing (.json); bg е източникът,
                      en/it — огледала; паритетът на ключовете се гейтва от теста
tests/                unit · engine/ · integration/ (реален Postgres)
print/                брошурата за клиенти: build-brochure.ts → PDF на трите езика; locales/*/brochure.json
```

## Правила, които не се нарушават

- **Пари = цели евроценти.** Цената се смята само на сървъра (`plans/pricing.ts`); заявката от клиента
  носи само избора (`m1|m3|m6|m12|lifetime`). Lifetime = 2,5 × годишната цена БЕЗ отстъпката за 12 месеца.
- **Тестов период = 30 дни от потвърждаването на имейла.** Изтекъл акаунт: изтегля (изходите се смятат на
  сървъра от ЗАПАЗЕНАТА спецификация), но не създава, не запазва и не копира. Изтриване — винаги.
- **Сесии в базата**, не JWT: бан, смяна на парола и смяна на роля ги прекратяват веднага. Бисквитките са
  `__Host-` в продукция, HttpOnly, SameSite=Strict.
- **Персоналът влиза в `/admin` само с 2FA**; действие върху акаунт иска способност (`rbac.ts`) И по-висок
  ранг от целта. Всяко действие на персонала се записва в одитната верига.
- **Без изброяване на акаунти**: еднакъв отговор при регистрация/забравена парола/вход; причината за бан се
  показва само след вярна парола.
- **HWID е отпечатък, не хардуерен номер** — браузърът не дава такъв. Хеш на хардуерните сигнали.
- **Каталогът от магазините е само на сървъра** (`data/catalog.json`, извън репото). Без него —
  основният каталог.
- **Редакторът, чертежите и CSV засега са на български** (етикетите идват и от двигателя). Заглавната
  лента и всичко извън редактора е BG/EN/IT; витрината и FAQ го казват открито.
- Нов текст → първо `locales/bg/<раздел>.json`, после en/it; тестът хваща липсващи ключове и разминати `{…}`.
- **Историята пази знаци, не думи**: кой/защо в плана, бана, заявките и одита се записва като `@system`,
  `@customer:<id>`, `@signup`… (`src/labels.ts`) и се превежда при показване с `fmt.label(...)`. Името на
  служител остава както е.
- **Таблица с данни** = `<table class="stack">` + `data-label` на всяка клетка (същият текст като заглавието):
  на телефон редът става карта (`public/css/stack.css`), вместо колоните да се крият зад хоризонтален скрол.
- В BG дата в дълъг формат завършва с „г.“ — не слагай точка след `{date}` (тестът го хваща).
- Файл над 300 реда се разделя преди да се добавя (CSS: виж `public/css/`).
- Футърът носи „Created and Designed by Carbon Stealth VCC“; keywords ≥5 с „Carbon Stealth“.

## Деплой

Docker Compose (db + app) + nginx на хоста — `DEPLOY.md`. Тайните са само в `.env` на сървъра (mode 600).
