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
goes into the QR code and vCard), optional `DATA_DIR` (default `./data`). See
`.env.example`.

## Layout

```
src/app.js           Express app (helmet CSP+nonce, HSTS, no-store за auth страници;
                     /robots.txt /sitemap.xml /privacy /terms) — export
src/server.js        listen (PORT, default 3100)
src/db.js            SQLite схема (users, sessions, profiles) + леки ALTER миграции
src/auth.js          сесии (httpOnly cookie, sha256 токен в БД), bcrypt пароли
src/csrf.js          CSRF (synchronizer token, timing-safe)
src/slug.js          транслитерация BG→latin, валидация, резервирани думи, unique
src/vcard.js         vCard 3.0 генератор (сгъване на редове, снимка base64)
src/themes.js        цветови теми на визитката (CSS клас theme-<id>)
src/seo.js           COMPANY (импресум), robots, sitemap, JSON-LD Person/Organization
src/config.js        baseUrl (PUBLIC_BASE_URL или от заявката)
src/routes/auth.js   /register /login /logout /settings/password (+ rate limit)
src/routes/dashboard.js  /dashboard, /profile (редакция+тема), /profile/photo (multer)
src/routes/public.js /p/:slug (брояч views), qr.png, vizitka.vcf, /photo/:file
src/views/           EJS (home, register, login, dashboard, card, privacy, terms, 404)
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
- **Никакви inline скриптове** — CSP е `script-src 'self'`; клиентска логика само в
  `public/app.js`.
- **CSRF токен на всички автентикирани POST форми**; сесийният токен се пази само
  като sha256 хеш в БД; пароли — bcrypt (cost 12).
- **Снимките** отиват в `data/uploads/` с произволно hex име (jpeg/png/webp, ≤2 MB);
  сервират се само през `/photo/:file` със строга валидация на името.
- **Слъгът е обещание.** QR кодът сочи `/p/<slug>` — предупреждаваме потребителя,
  че смяна на слъга чупи отпечатани кодове. Не добавяй redirect магия без план.
- `data/` не влиза в git; секрети — само на сървъра (systemd `EnvironmentFile`, 600).
- **Правни страници** (`/privacy`, `/terms`) са обвързани с реалното поведение на
  приложението — промениш ли какви данни се пазят/бисквитки, обнови и тях.
- Roadmap (не е имплементирано): забравена парола (имейл), изтриване на акаунт от
  UI (сега — по заявка на privacy@), NFC, няколко визитки на акаунт, дневна
  разбивка на статистиката.
