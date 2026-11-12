# CLAUDE.md — Фактурист

Онлайн фактуриране за фирми и счетоводни кантори в България, с ядро върху европейския стандарт EN 16931:
всеки документ се издава и като структуриран XML (UBL 2.1 и CII). Така продуктът е готов за задължителните
структурирани е-фактури по законопроект № 52-602-01-60 (от 01.07.2028). Кантората издава от името на
фирмите-клиенти по пълномощно (чл. 113, ал. 7 ЗДДС). Мастър панел `/admin` за собственика.
Самостоятелен продукт — `cd fakturist/` за всичко. Порт 4340. Домейн: fakturist.bg (временно
fakturi.carbonstealth.eu — решение на собственика от 12.11.2026). BG източник + EN.

## Стек

Node ≥22 · TypeScript strict (ESM, `NodeNext`) · Express 5 · EJS (строг CSP с nonce, `style-src-attr 'none'`)
· Prisma 6 + PostgreSQL 16 · zod на всеки външен вход · pino (без PII) · Argon2id · JWT (jose, HS256) в
HttpOnly бисквитка срещу сесия в базата · TOTP (RFC 6238, без зависимост) · IBM Plex Sans/Mono от
@fontsource (без CDN). Плащания: Revolut Business (webhook с HMAC подпис) + ръчно потвърждение от панела.

## Команди (гейтът)

```bash
npm ci
npm run check              # prisma generate, format:check, typecheck, test, build — преди всеки push
npm test                   # unit (node:test през tsx) — без база
npm run test:conformance   # официалните XSD + Schematron (EN 16931 v1.3.17, Peppol BIS 3 2026.5) — иска java + xmllint
npm run test:integration   # реален PostgreSQL: TEST_DATABASE_URL (името завършва на _test/_ci — таблиците се трият)
npm run samples            # примерните документи като UBL/CII в samples/ (профил: en16931 | peppol)
npm run owner:create       # първият MASTER + плановете: OWNER_EMAIL / OWNER_NAME / OWNER_PASSWORD
npx tsx scripts/preview-site.ts   # витрината с примерни данни → снимки 390/1440, светла/тъмна
```

## Подредба

```
src/
  einvoice/      ЯДРОТО (без база, без мрежа): decimal.ts (пари без float, half-up) · model.ts (входът по
                 BT/BG на EN 16931, zod) · calculate.ts (редове, отстъпки, ДДС по категории, тотали, ДДС в
                 евро) · rules.ts (EN 16931 + Peppol + ЗДДС: BG-01…BG-09) · ubl.ts / cii.ts (сериализатори,
                 редът на елементите е по XSD) · notes.ts (бележката BT-22) · bg-ids.ts (ЕИК, ДДС номер) ·
                 codes.ts · xml.ts · index.ts (`buildEInvoice` — целият път)
  documents/     issue.ts (издаване в транзакция: заключване на фирмата → номер от серията → ядро →
                 звено във веригата → одит) · numbering.ts · form.ts (формата → входа)
  ledger/        chain.ts — веригата от отпечатъци на документите (SHA-256 + HMAC печат), проверката ѝ
  auth/          roles.ts (7 нива, способности, пълномощни) · guards.ts (CSRF, requireUser/Master/Org) ·
                 sessions.ts · password.ts · totp.ts · keys.ts (HKDF от LEDGER_SEAL_KEY)
  accounts/      register.ts (фирма или кантора — една транзакция)
  admin/         registry.ts (ВСЯКА таблица → мастър панела; тест пада, ако липсва) · settings.ts
                 (глобалните настройки — единствен списък)
  billing/       plans.ts (началните планове) · public-plans.ts · seed-plans.ts · revolut.ts (подписът)
  features.ts    регистърът на функциите (live/planned + дата) — плановете, панелът и витрината четат оттук
  seo/           pages.ts (страниците на витрината — единствен списък) · structured-data.ts (JSON-LD)
  routes/        site · seo · health · auth · app · admin · webhooks · mount (редът)
views/           site/ (витрината — Дизайнера) · app/ · admin/ · auth/ · errors/ · partials/
locales/{bg,en}/ site · features · auth · app · admin · errors — еднакви ключове (тест)
scripts/         conformance/run.mjs (официалната проверка) · samples.ts · fonts.mjs · og.mjs · preview-site.ts
```

## Правила (не се нарушават)

- **Пари — само цели числа/BigInt** (`src/einvoice/decimal.ts`), никога float. Закръгляне half-up далеч от
  нулата, само на крайните суми.
- **Доставчикът и номерът идват от сървъра**, никога от формата (`documents/issue.ts`).
- **Номерацията е без пропуски**: номерът се взема с `UPDATE … RETURNING` в транзакцията на издаването.
  Никога `SEQUENCE` (дава дупки при rollback). Тестът за 8 едновременни издавания пази това.
- **Издаден документ не се пипа.** Поправката е известие (381/383) или анулиране. Веригата и печатът
  издават всяка промяна. `LEDGER_SEAL_KEY` никога не се сменя.
- **Нова таблица → ред в `src/admin/registry.ts`** (с `hidden` за всичко чувствително). Нова функция →
  `src/features.ts` + преводите. Нова настройка → `src/admin/settings.ts`. Тестовете пазят и трите.
- **Промяна в ядрото → `npm run test:conformance`** (официалните правила), не само unit тестовете.
- **`planned` функции никога не се показват като налични** на витрината (заблуждаваща реклама).
- **Никога „одобрен от НАП“ или „сертифициран“** — до наредбата по чл. 120а, ал. 9 от законопроекта такова
  одобрение не съществува.
- Права по план — само от проверен webhook на Revolut или от мастър панела, никога от redirect.
- Регистрацията е затворена (`REGISTRATION_OPEN=false`), докато правните текстове не са публикувани.
