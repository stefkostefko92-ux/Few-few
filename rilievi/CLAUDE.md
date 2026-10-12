# CLAUDE.md — Rilievi Impianti

Портал само с покана за схемите за оглед на асансьорни уредби („scheda rilievo impianto“): попълване на
29-те полета от заданието, търсене (№ на асансьора, матрикула, адрес, марка, бележки), печат A4 и PDF.
Многофирмен: всяка фирма (клиент на портала) има свои хора, свои карти и свое лого на листа.
Бранд Carbon Stealth VCC, монохромен (бяло/черно, светла и тъмна тема). Самостоятелен продукт —
`cd rilievi/` за всичко. Домейн: rilievi.carbonstealth.eu (порт 4330).

## Стек

Node ≥22 · TypeScript strict (ESM, `NodeNext`) · Express 5 · EJS (сървърно рендиране, строг CSP с nonce,
`style-src-attr 'none'`) · Prisma 6 + PostgreSQL 16 (`pg_trgm`) · zod на всеки външен вход · pino (без
PII и токени) · Argon2id · JWT (jose, HS256) в HttpOnly бисквитка, проверяван срещу сесия в базата ·
pdfkit + DejaVu Sans (PDF с кирилица) · multer + sharp (логото на фирмата, прекодирано) · Fira Sans /
Fira Sans Condensed от @fontsource (без CDN).
UI: италиански (източник) + български + английски.

## Команди (гейтът)

```bash
npm ci
npm run check            # prisma generate, format:check, typecheck, test, build — преди всеки push
npm test                 # unit (node:test през tsx) — без база
npm run test:integration # реален PostgreSQL: TEST_DATABASE_URL (името съдържа _test/_ci — таблиците се трият)
npm run test:e2e         # Chromium + axe (WCAG 2.1 AA) срещу работещ портал: RILIEVI_URL, E2E_EMAIL, E2E_PASSWORD
                         # (MASTER акаунт); създава фирма, карти и покани — само локално/staging
npm run dev              # локално на :4330, чете .env (README, „Локално“)
npm run build            # prisma generate + tsc + шрифтовете в public/fonts (scripts/fonts.mjs)
npm run owner:create     # първият MASTER от OWNER_EMAIL/OWNER_NAME/OWNER_PASSWORD (на сървъра: deploy/create-master.sh)
```

## Подредба

```
src/
  config.ts          zod схема на средата (процесът не тръгва с полуготов конфиг)
  server.ts          helmet/CSP, редът на middleware-ите и рутерите, грешките
  auth/              роли (7 нива), scope.ts (обхватът по фирма), пароли, JWT сесии, заключване, CSRF
  aziende/           service.ts (фирмите) · logo.ts (проверка по байтове + прекодиране през sharp)
  services/          вход, покани, потребители, токени (в базата само SHA-256)
  schede/            fields.ts (ЕДИНСТВЕНИЯТ списък полета) · validation.ts · search.ts · service.ts ·
                     format.ts · pdf.ts + pdf-layout.ts
  routes/            тънки рутери: проверка → услуга → изглед
views/               EJS: partials/ (горна и долна лента, табелата, филтърът по фирма), auth/, schede/,
                     users/, aziende/, account/, audit/
locales/<език>/      common · auth · schede · users · aziende · mail (.json); it е източникът, bg/en — огледала
public/              css/ (base, layout, plate, forms, pages, data, print), js/app.js (прогресивно), img/
tests/               unit · integration/ (реален Postgres) · e2e/run.mjs (Playwright + axe)
deploy/              deploy.sh · setup-env.sh · create-master.sh · backup.sh · nginx/ · systemd/
```

## Правила, които не се нарушават

- **Регистрация няма.** Акаунт се ражда само от приета покана (`services/invites.ts`) или от
  `owner:create` за първия MASTER. Имейлът и ролята идват от поканата, не от формата. Токенът на
  поканата/новата парола е 32 случайни байта; в базата е само SHA-256; връзката се показва веднъж.
- **Роли — 7 нива като ERP Ascensori** (`auth/roles.ts`): MASTER(1) > ADMIN > DIREZIONE > RESPONSABILE >
  TECNICO > OPERATORE > CLIENTE(7). Проверката е по способност и винаги на сървъра. MASTER е
  собственикът на портала (Carbon Stealth): без фирма, вижда всички, само той създава фирми
  (`aziende:manage`). ADMIN е най-високата роля във фирмата. Кани и управлява хора (`users:manage`) САМО
  ADMIN — в своята фирма — и MASTER — във всяка фирма, която избира при поканата; винаги роли ПОД своята,
  никога себе си (`services/users.ts`, `canManage`). CLIENTE е само четене; кошчето и одитът — ADMIN+.
- **Фирмите са изолирани** (`auth/scope.ts`). Всяка заявка към карти, хора, покани, одит и лого минава
  през `scopeOf(user)`: фирмата вижда само своето, MASTER — всичко (с филтър по фирма). Чужд запис е 404,
  не 403. В базата: `User_azienda_role_check` (MASTER ⇔ без фирма), `aziendaId` NOT NULL на карта и покана.
  Новата карта влиза във фирмата на автора (MASTER я избира). Деактивирана фирма спира хората си веднага.
- **Логото** се проверява по байтовете (PNG/JPEG/WebP, никога SVG), до 1 MB, и се ПРЕКОДИРА през sharp
  (`aziende/logo.ts`): до 1200×600, без EXIF. Прекодирането пази и процеса — pdfkit декодира PNG с
  прозрачност асинхронно и при повреден файл хвърля извън всеки try/catch. Пази се в базата (bytea —
  влиза в бекъпа), показва се само на фирмата и на MASTER. Стои най-горе вляво на листа и на PDF-а; вдясно
  — кой е попълнил картата („Compilata da“).
- **Сесия = JWT + ред в базата.** JWT-то носи само `sid`; изход, деактивиране и смяна на паролата
  прекратяват сесията веднага. Бисквитките са `__Host-` в продукция, HttpOnly, SameSite=Lax; записите
  пазят synchronizer CSRF токен + проверка на Origin. Формите преди вход — двойна бисквитка.
- **Без изброяване на акаунти:** непознат имейл и грешна парола — един отговор, едно време (фиктивен хеш),
  едно заключване (5 опита → 15 мин, `auth/lockout.ts`; непознатите се броят в паметта).
- **Полетата са в `schede/fields.ts`** — формата, проверката, страницата, печатът и PDF-ът се строят
  оттам; редът е дословно от заданието. Ново поле = ред там + колона в схемата (миграция) + ключове в
  трите речника (тестът хваща липсващите). Идентификаторите (matricola, n° impianto) са низове само от
  цифри — водещата нула се пази. Десетичните приемат „6,5“ и „6.5“, пазят се като Decimal.
- **Търсенето** пише `searchText` (нормализиран: малки букви, без ударения) само в `schede/service.ts`;
  триграмен GIN индекс (`pg_trgm`). Всяка дума трябва да се намери; пълното съвпадение на номера е първо.
  Заявката отива като параметри (`Prisma.sql`), никога в текста на SQL.
- **Записът е само върху отворената версия** (`base` = updatedAt): промяна от друг междувременно → 409,
  въведеното остава на екрана.
- **Изтриване = кошче** (`deletedAt`); окончателно — само ADMIN+ от кошчето. Всичко пише в одита
  (`audit.ts`, само добавяне, без съдържание на схемите и без IP).
- **PDF:** DejaVu Sans от `PDF_FONT_DIR` (в образа: `fonts-dejavu-core`); без шрифта процесът не тръгва.
  Никога Helvetica/Times — нямат кирилица.
- **Порталът не се индексира:** `noindex, nofollow`, robots.txt `Disallow: /`, без sitemap/llms.txt —
  съзнателно (частен инструмент само с покана). Keywords ≥5 с „Carbon Stealth“ все пак стоят (правилото
  на репото). Футърът носи „Created and Designed by Carbon Stealth VCC“.
- Коментарите в `src/`, `views/`, `deploy/` — на български; тестовете и `scripts/` — на английски.
- Файл над 300 реда се разделя преди да се добавя.
- Миграциите се пишат на ръка (`prisma migrate diff`) и се прилагат само с `migrate deploy`; никога
  `db push` в продукция. `pg_trgm` е в първата миграция.

## Деплой

Docker Compose (db + app на 127.0.0.1:4330) + nginx на хоста — `DEPLOY.md`. Веднъж: `deploy/setup-env.sh`
(тайните в `/opt/few-few/shared/rilievi/.env`, 600), сертификат, после `deploy/create-master.sh`. Един
път за ръчния и автоматичния деплой: `deploy/deploy.sh` (вика го `deploy/autodeploy.sh`, проект
`rilievi`): бекъп преди миграция, сонда с маркер `"app":"rilievi"`, `last-good`, дневен бекъп
(`rilievi-backup.timer`, 14 дни), vhost-ът от репото. Изход 0/3/4/1 — като korpora.
