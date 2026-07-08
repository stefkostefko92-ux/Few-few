# vizitka/ — винаги актуалната дигитална визитка

Vizitka lets anyone create a professional profile — personal or company — reachable
at `/p/<slug>` via a permanent QR code. Print the QR once (paper card, sticker,
shop window); the profile behind it is edited from the dashboard, so the "business
card" never goes stale. Visitors save the contact with one tap (vCard `.vcf`).

_Stack: Node.js · Express · EJS · SQLite (better-sqlite3) — plain JS (ESM), no
build step (same conventions as `medqr/`). Root rules live in the repo-root
`CLAUDE.md`._

## Commands (run inside `vizitka/`)

```bash
npm install
npm start                       # http://localhost:3100
npm run dev                     # node --watch auto-reload

# Quality gates:
npm run lint                    # ESLint (flat config)
npm run format:check            # Prettier
npm test                        # node test/smoke.test.js (full-flow smoke test)
```

Node ≥20 required. Prod env: `NODE_ENV=production`, `PUBLIC_BASE_URL` (HTTPS —
goes into the QR code and vCard), optional `DATA_DIR` (default `./data`),
`ADMIN_EMAILS` (comma-separated — grants `/admin` access), `MASTILKO_URL` (печатен
партньор), `PRINT_API_SECRET` (**задължителна в продукция** — подписва печатния
handoff токен), `INDEXNOW_KEY` (авто-подаване към Bing; сервира се на `/<key>.txt`).
See `.env.example`.

## Layout

```
src/app.js           Express app (helmet CSP+nonce, HSTS, no-store за auth страници;
                     /robots.txt /sitemap.xml /privacy /terms) — export
src/server.js        listen (PORT, default 3100)
src/db.js            SQLite схема (users, sessions, profiles, banners, links) + ALTER миграции
src/auth.js          сесии (httpOnly cookie, sha256 токен в БД), bcrypt пароли;
                     requireAdmin + seedAdmins (ADMIN_EMAILS)
src/banners.js       рекламни банери: activeBanners (импресии), clickBanner, CRUD helpers
src/personalize.js   персонализация: цвят (accent→нонсиран <style>), форма, шрифт
src/links.js         собствени бутони: getLinks, replaceLinks, parseLinkFields (MAX_LINKS)
src/print.js         печатен handoff към mastilko-bg.com: HMAC токен + buildPrintPayload
src/csrf.js          CSRF (synchronizer token, timing-safe)
src/slug.js          транслитерация BG→latin, валидация, резервирани думи, unique
src/vcard.js         vCard 3.0 генератор (сгъване на редове, снимка base64)
src/themes.js        цветови теми на визитката (CSS клас theme-<id>)
src/seo.js           COMPANY (импресум + structured address/geo Бобов дол), robots
                     (AI-ботове без /p/; /api /b /print disallow), sitemap (lastmod),
                     llms.txt, FAQ, JSON-LD (сайт: WebSite + Organization/LocalBusiness
                     с geo+areaServed=BG + WebApplication offer:0 + FAQPage; визитка:
                     Person/Organization + BreadcrumbList)
src/indexnow.js      IndexNow — авто-подаване на публичните URL към Bing (INDEXNOW_KEY)
src/config.js        baseUrl (PUBLIC_BASE_URL или от заявката)
src/routes/auth.js   /register /login /logout /settings/password (+ rate limit)
src/routes/dashboard.js  /dashboard, /profile (редакция+тема), /profile/photo (multer)
src/routes/public.js /p/:slug (views), qr.png, vizitka.vcf, /p/:slug/print, /api/print/:token, /photo/:file
src/routes/admin.js  /admin (requireAdmin) — CRUD на банери (multer), toggle, move, delete
src/routes/wallet.js /p/:slug/wallet/apple.pkpass + /wallet/google + Apple update web service (/v1/…)
src/wallet/          портфейли (без нови зависимости): apple.js (.pkpass билд+openssl подпис),
                     google.js (save JWT + PATCH auto-update), apns.js (ES256 пуш), binary.js
                     (ZIP/PNG/CRC32/SHA-1), shared.js (флагове/цветове/токен), index.js (фасада)
src/views/           EJS (home, register, login, dashboard, card, admin, privacy, terms, 404)
public/              styles.css (вкл. теми), app.js (CSP-safe клиентска логика)
test/smoke.test.js   пълен поток: регистрация→редакция→тема→views→визитка→QR→vCard→
                     CSRF→правни/SEO→смяна на парола
deploy/              systemd unit (hardened), nginx conf, DEPLOY.md (autodeploy модел)
```

CI: `.github/workflows/vizitka.yml` (path-filtered, Node 20+22 — lint, format, test).
Deploy: през `deploy/autodeploy.sh` в корена (`deploy_vizitka`, systemd модел като
medqr — rsync без `data/`, npm ci, снимка на базата, health check + rollback).

## Conventions (important)

- **Plain JavaScript, ESM**; no TypeScript, no build step. `node:`-prefixed core modules.
- **Никакви inline скриптове** — CSP е `script-src 'self' 'nonce-…'`; клиентска логика
  само в `public/app.js`. Собственият цвят на визитката е единственият динамичен стил
  и идва през **нонсиран `<style>`** блок (`accentCss`), НЕ inline `style=""` (блокиран).
- **Персонализация:** потребителят избира тема ИЛИ собствен цвят (accent), форма на
  аватара, шрифт, корична снимка и до `MAX_LINKS` собствени бутона (връзки). Всички
  връзки минават валидация за http(s); картинките (снимка/лого/корица) са в uploads
  и се сервират през `/photo/:file`.
- **CSRF токен на всички автентикирани POST форми**; сесийният токен се пази само
  като sha256 хеш в БД; пароли — bcrypt (cost 12).
- **Снимките** отиват в `data/uploads/` с произволно hex име (jpeg/png/webp, ≤2 MB);
  сервират се само през `/photo/:file` със строга валидация на името.
- **Слъгът е обещание.** QR кодът сочи `/p/<slug>` — предупреждаваме потребителя,
  че смяна на слъга чупи отпечатани кодове. Не добавяй redirect магия без план.
- `data/` не влиза в git; секрети — само на сървъра (systemd `EnvironmentFile`, 600).
- **Правни страници** (`/privacy`, `/terms`) са обвързани с реалното поведение на
  приложението — промениш ли какви данни се пазят/бисквитки, обнови и тях.
- **Privacy-by-default (чл. 25(2) ОРЗД):** новият профил е СКРИТ (`is_public=0`) и
  без предварително попълнен имейл — потребителят публикува съзнателно от таблото.
  Не връщай „публично по подразбиране“. DSA: „Подай сигнал“ на всяка визитка +
  notice-and-action процес в ОУ.
- **Печатен handoff (Мастилко / mastilko-bg.com):** Мастилко е безплатно client-side
  ателие в браузъра, където потребителят САМ оформя и си разпечатва визитката (ние НЕ
  печатаме, няма поръчка). От таблото/визитката „Разпечатай визитки (Мастилко)“ →
  `/p/:slug/print` рендира преглед + бутон към
  `${MASTILKO_URL}/import?source=vizitka&token=<HMAC>`. Токенът е подписан с
  `PRINT_API_SECRET`, важи 30 мин. Мастилко (client-side fetch, CORS към `MASTILKO_URL`)
  вика `GET /api/print/:token` и получава JSON с данните (`buildPrintPayload`), за да
  попълни редактора. Токенът оторизира → работи и за скрит профил. Само публичните данни.
  (Домейнът в mastilko PR #73 е `mastilko.carbonstealth.eu`; тук е конфигуриран
  `mastilko-bg.com` по избор на собственика — сменя се през `MASTILKO_URL`.)
- **Портфейли (Apple Wallet + Google Wallet):** визитката се добавя в телефонния
  портфейл; картата носи QR към живия `/p/:slug`, затова е винаги актуална. **Без нови
  npm зависимости** — `.pkpass` се подписва през системния `openssl` (PKCS#7 detached),
  ZIP/PNG се пишат ръчно (`src/wallet/binary.js`); Google „save" е RS256 JWT, а
  auto-update е Apple APNs пуш (ES256 през `node:http2`) + Google API PATCH — всичко с
  `node:crypto`/`fetch`. **Feature-gated като IndexNow/печат:** активира се само когато
  сертификатите/ключовете са зададени (файлове, права 600, извън репото — виж
  `.env.example`/`DEPLOY.md §7`); иначе бутоните са скрити и маршрутите връщат 404.
  Разкрий трансфера към Apple/Google в `privacy.ejs`, ако пипаш какво се праща. Apple
  update web service e на `/v1/…` (токен `ApplePass`, HMAC върху **`profile.id`** — не slug,
  за да не се чупи при преименуване); серийният номер/objectId също са `profile.id`.
  Регистрациите на устройства са в `apple_pass_registrations`; скрита визитка → `/v1/passes`
  връща 404 (спира обновяването). `.pkpass` се кешира по (id, updated_at) и публичните
  портфейл маршрути са rate-limited (openssl spawn е скъп). Бутоните са локални SVG
  (`public/badge-*-wallet.svg`) — сменяй само с официалните артове при нужда.
- **Реклами:** банерите се показват само на началната страница (`placement='home'`),
  НЕ върху потребителските визитки. First-party (без чужди тракери → без консент
  банер); всеки носи етикет „Реклама“ и `rel="sponsored"`. Управляват се от `/admin`
  (само `ADMIN_EMAILS`). Кликовете минават през `/b/:id/click` (брои + пренасочва,
  само http/https цели). Банер картинките ползват същия `/photo/:file` сървър.
- **Забравена парола (имплементирано):** `/forgot` изпраща single-use HMAC токен по
  имейл (`mailer.js`, SMTP или dev outbox), `/reset` сменя паролата и изтрива всички
  сесии. Без изтичане на акаунти (еднакъв отговор), rate-limited. Таблица
  `password_resets`.
- Roadmap (не е имплементирано): изтриване на акаунт от UI (сега — по заявка на
  privacy@), NFC, няколко визитки на акаунт, дневна разбивка на статистиката.
