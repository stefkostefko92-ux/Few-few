# eternaltouch/ — Eternal Touch · Atelier за ръчни гипсови декорации

Eternal Touch е **бранд на майчината фирма Carbon Stealth VCC** — итало-български
атѐлие за ръчно изработени гипсови декорации, бонбониери за събития и персонализирани
изделия. Сайтът е **витрина/каталог** (не онлайн магазин): поръчки се правят чрез
директен контакт + оферта + капар. Многоезичен (IT/BG/EN), живее на `eternaltouch.it`.

_Stack: Node.js · Express · EJS (`express-ejs-layouts`) · Prisma · PostgreSQL —
plain JS (ESM), без build стъпка. Deploy: Docker Compose + Nginx + Let's Encrypt.
Root правилата са в repo-root `CLAUDE.md`._

## Commands (изпълнявай вътре в `eternaltouch/`)

```bash
npm install
npm run setup                   # prisma generate + migrate deploy + seed
npm start                       # node src/server.js  → http://localhost:4300
npm run dev                     # node --watch авто-reload
npm run prisma:seed             # само seed (admin + колекции + съдържание)
```

Node ≥20. Задължителни env (виж `.env.example`, режим 600, **никога** в git/архив):
`DATABASE_URL`, `JWT_SECRET`/`COOKIE_SECRET`/`SESSION_SECRET` (≥32 знака — приложението
**отказва да стартира** без тях), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (seed-ва админа —
без вграден дефолт), `SITE_URL`, и `SMTP_*` (Register.it; без тях съобщенията се
пазят в БД, но имейл не тръгва).

## Layout

```
src/server.js            Express (helmet CSP, compression, cookie-parser с fail-fast
                         secret, rate limit, статик, 404/500, graceful shutdown);
                         дневен purge на ContactMessage >24м (GDPR retention)
src/middleware/auth.js   JWT в httpOnly cookie (SameSite=Strict), fail-fast secret,
                         pinnat HS256; generateToken + requireAdmin
src/middleware/language.js  език: URL префикс > cookie > IP (geoip-lite) > Accept-Lang
                         > BG default; сетва lang cookie при префикс визита; изчислява
                         canonical (по език) + чист `path` за hreflang; req.t/localized
src/routes/public.js     начална, колекции, продукти, /healthz (минимален), /lang/:code
                         (open-redirect guard), правни страници; JSON-LD (ldSafe escape)
src/routes/admin.js      админ CRUD (колекции/продукти/галерия/съдържание/съобщения) +
                         смяна на парола; multer memoryStorage → sharp→webp + thumbs;
                         safeUnlinkPublic (path-traversal guard, само в uploads/)
src/routes/api.js        POST /api/contact (honeypot + строг rate limit 5/15м; save-first,
                         после fire-and-forget имейл; consent=acknowledgement, минимизиран
                         audit trail)
src/routes/seo.js        robots.txt, sitemap.xml (+ hreflang alternates), llms.txt,
                         security.txt, humans.txt
src/lib/email.js         nodemailer (Register.it SMTP, lazy singleton); admin известие +
                         клиентско потвърждение
src/locales/{bg,it,en}.json   UI низове (BG източник на истината)
src/public/fonts/        self-hosted шрифтове (Italiana/Cormorant/Lora/Cinzel, latin+кирилица) +
                         fonts.css — GDPR: нула заявки към Google
src/views/               EJS: layouts/main, partials (header/footer/cookie-banner),
                         pages (home, collection, product, privacy, cookies, terms, legal, 404/500),
                         admin/*
prisma/schema.prisma     AdminUser, Session, Collection, Product, GalleryItem, SiteContent,
                         ContactMessage (многоезични полета *It/*Bg/*En)
prisma/seed.js           идемпотентен seed (fail-fast при липсващ ADMIN_PASSWORD)
```

## Deploy

Docker Compose (app + postgres). Каноничен flow: `.env` се създава **на сървъра**
(секретите се генерират там, не пътуват в архива), после:

```bash
bash deploy.sh                  # idempotent: .env guard, docker up --build, seed,
                                # nginx config, certbot (--deploy-hook reload nginx)
```

Nginx: `nginx/eternaltouch.conf` (модерен TLS + OCSP stapling, HTTP/2, security
headers повторени на статиката/uploads, gzip). Портовете app:4300 / postgres:5437
слушат само на `127.0.0.1` (зад nginx). Хардънинг в compose: `cap_drop: ALL`,
`no-new-privileges`, mem/pids лимити, non-root `etuser`, tini PID 1, healthcheck.

Пълен разказ + чеклист за сигурност → `DEPLOYMENT.md`, `AUDIT-FIXES.md`.

## Gotchas / инварианти

- **Витрина, не e-commerce**: няма онлайн checkout; договорът се сключва офлайн (важи за
  правния профил — по-нисък DSA/EAA обхват). Не приписвай e-commerce задължения.
- **Тайните никога в репо/архив**: `.env` и `CREDENTIALS.txt` са в `.gitignore`+`.dockerignore`;
  каноничният zip-деплой не бива да ги носи. При компрометиране — ротирай всичко.
- **BG = източник на истината** за UI; правните страници са ръчно локализирани по език
  (не през locales) — пази ги синхронни в трите езика.
- **hreflang/canonical**: изчисляват се в `languageMiddleware` след махане на езиковия
  префикс; canonical зависи от сервирания език (BG = root без префикс). Не мести реда на
  middleware-а, за да не счупиш това.
- Прод env `NODE_ENV=production` (иначе cookie-тата не са `secure`).
```
