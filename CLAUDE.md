# CLAUDE.md

Тези preferences важат за всеки чат в това репо. Следвай ги без изключение.

## ПОВЕДЕНИЕ
- Винаги директно, без "Разбира се", похвали, въведения, заключения.
- Винаги български за чат, английски за код/логове/commits/comments.
- При неуспех — точно какво не работи и защо, не "имаше проблем".
- Без emoji/bullets/заглавия при отговори под 5 изречения.
- Не повтаряй какво работи — само промени и счупени неща.

## СЕНЬОР МИСЛЕНЕ (преди код)
- Опиши с 1–2 изречения: проблем, вход, изход, edge cases.
- View целия файл преди edit, не само частта която сменяш.
- Непознат API/version → docs/source преди отговор, не памет.
- Неясни requirements → спри и попитай, не предполагай.
- "Boring tech": доказано пред модерно. YAGNI.
- "Готово" = build OK + smoke test + curl health 200.

## КАЧЕСТВО НА КОДА
- TypeScript strict, никога `any` — `unknown` + type guard.
- Async с try/catch на boundary (route/job/CLI). Никога незаловен Promise.
- Validation на всеки external input със zod.
- Никога hard-coded secrets/URL/ID — env vars.
- Никога mock data, TODO, console.log в prod код.
- Имена: какво прави (`getUserById`), не как (`fetchData`).
- Файл >300 реда → разделяй преди да добавяш.

## DATABASES (Prisma + PostgreSQL)
- Винаги `migrate deploy` на prod, никога `db push`.
- Никога DELETE/UPDATE без WHERE.
- Index на всеки FK и често търсено поле.
- Транзакции за multi-step writes.
- Backup + dry-run на staging преди миграция.

## СИГУРНОСТ
- JWT в httpOnly cookie, не localStorage.
- Passwords с bcrypt/argon2, никога plain/MD5/SHA1.
- Rate limit на auth и публични endpoints.
- CORS whitelist, никога `*` на prod.
- Prepared statements/Prisma, без string concat в SQL.
- Без `dangerouslySetInnerHTML` без sanitization.
- Authz на всеки protected endpoint, не само authn.
- Stripe webhook: винаги signature verify.

## CARBON STEALTH STACK (стандарт за всички проекти)
- Backend: Node 22 + TS + Express 5 (или Next.js 15 full-stack за SaaS), Prisma, PostgreSQL, Redis, BullMQ.
- Frontend: React 18 + Vite + Tailwind, или Next.js 15 App Router.
- Deploy: Docker compose + nginx + Let's Encrypt + PM2 ecosystem.config.js.
- VPS: 178.104.77.242, subdomain.carbonstealth.eu pattern.
- Преди deploy: `ss -tlnp` срещу заетия port map в паметта.
- Email: Brevo SMTP (Hetzner блокира 25/465/587).
- Auth: JWT + 7-level role hierarchy (както в ERP Ascensori).
- Admin credential pattern: admin@carbonstealth.eu / ProjectName2026!.
- Storage: backend DB задължително, никога localStorage.
- PDF Cyrillic: ReportLab + DejaVu/FreeSerif TTF регистриран, никога Helvetica/Times.
- Multi-language default: BG + IT + EN (+ RU/FR/EL при поискване).
- Никога placeholder снимки/lorem ipsum — реални данни или поискай assets.
- nginx config като файл в репо, не ръчно на сървъра.

## DEPLOY & DEVOPS
- Bash идемпотентен, винаги `set -euo pipefail`.
- Docker: multi-stage, .dockerignore, non-root user, HEALTHCHECK.
- Един tar.gz архив за промени, не отделни файлове.
- Деплой завършва с `curl /health` 200 OK.
- Rollback план: DB backup + предишен build преди всеки deploy.
- Conventional commits, никога force-push на main.
- Structured logs (pino), никога console.log в prod, никога PII в логове.

## УЕБ САЙТОВЕ — SEO/GEO/AEO ENTERPRISE (задължително)

### SEO технически
- Уникален title <60 знака, meta description <160 знака per page.
- Един H1 per page, семантичен HTML5.
- Canonical URL на всяка страница.
- robots.txt + sitemap.xml с lastmod/changefreq/priority, sitemap index при >50K URLs.
- 404/500 custom страници, clean URLs без query strings за контент.
- HTTPS + HSTS, security headers (CSP, X-Frame-Options, Referrer-Policy).
- Open Graph пълен набор + Twitter Card summary_large_image.
- hreflang за всеки език + x-default.
- JSON-LD на всяка страница: Organization + WebSite + BreadcrumbList; добави Service/Product/Article/FAQPage/HowTo/Review според съдържанието.
- Internal linking: всяка страница ≤3 клика от home, breadcrumbs визуални + schema.
- Alt text на всички изображения, lazy loading, WebP/AVIF, explicit width/height, srcset за responsive.
- Lighthouse 95+ на 4-те категории. LCP <2.5s, CLS <0.1, INP <200ms.
- Visible "last updated" дата на статии, author bio за E-E-A-T.
- RSS feed за блог секции.
- Винаги friendly за всеки device.

### GEO (локално търсене)
- LocalBusiness JSON-LD: address, geo (lat/lng), openingHours, telephone, areaServed, priceRange.
- NAP идентичен на всяка страница и в schema.
- Geo meta: geo.region, geo.placename, geo.position, ICBM.
- Локални landing pages с град/регион в title, H1, URL slug.
- Embedded Google Maps или Leaflet/OSM на contact страницата.

### AEO (AI/voice/featured snippets)
- FAQPage schema, въпрос като H2/H3, директен отговор в първото изречение.
- HowTo schema за процеси и tutorials.
- Speakable schema за voice search.
- Article schema с author/datePublished/dateModified.
- llms.txt в root с описание на сайта и линкове към ключови страници за AI crawlers.
- Conversational headings (въпроси), кратки структурирани отговори.

### Footer (без изключение на всеки сайт)
- "Created and Designed by Carbon Stealth VCC" с линк https://carbonstealth.eu, target="_blank" rel="noopener".

## ИЗСЛЕДВАНЕ
- На езика на въпроса.
- Източник за всеки конкретен факт (число, дата, цена, закон, версия).
- Никога измислени статистики, цитати, URL, имена.
- При несигурност → search/web_fetch ПРЕДИ отговор.

## АНТИ-ХАЛЮЦИНАЦИИ
- Преди име на функция/CLI флаг/env var → провери в код/docs.
- Преди версия/feature → package.json или changelog.
- При >50% несигурност → "не знам, проверявам" + tool call.
- Никога измислен path, env var, port, ID, credential.
