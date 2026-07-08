# linketto/ — многоезичният „link in bio“

Linketto е глобален конкурент на Linktree: една публична страница
`/u/<slug>` с всичките линкове на създателя, която **говори езика на всеки
посетител**. Диференциатори (валидирани от проучването в
`research/link-in-bio/`): многоезичност навсякъде (лидерът е English-only),
EU хостинг/GDPR, аналитика без бисквитки, намалени комисиони (8% Free, 4% Pro,
0% само Business/Founder — срещу 12/9% при Linktree), прозрачна модерация без публични
„banned“ банери.

_Stack: Next.js 15 (App Router) · React 19 · TypeScript strict · Prisma ·
PostgreSQL · Tailwind · next-intl · Stripe. Конвенциите на zabobovdol.
Root правилата са в кореновия `CLAUDE.md`._

## Команди (изпълнявай в `linketto/`)

```bash
npm install
npm run dev                 # http://localhost:3000

# Качествени гейтове (задължителни преди „готово“):
npm run lint
npm run typecheck
npm test                    # node:test през tsx (чисти функции, без БД)
npm run build               # prisma generate + next build

npm run prisma:migrate:dev  # миграции (изисква PostgreSQL)
```

Env: виж `.env.example`. Stripe ключовете идват от свързания акаунт на
Carbon Stealth VCC — **само през env, никога в кода**.

## Архитектура

```
prisma/schema.prisma   Многоезичността е в схемата: Profile/Link имат
                       *Translation таблици (@@unique([родител, locale])).
                       ClickEvent = аналитика без бисквитки (без IP, без PII).
src/i18n/locales.ts    ЕДИНСТВЕНОТО място за добавяне на нов език (LOCALES,
                       LOCALE_NAMES, RTL_LOCALES, bestLocale за Accept-Language).
src/i18n/request.ts    next-intl: непълни преводи падат към en (deepMerge).
messages/<loc>.json    UI низове. bg е ИЗТОЧНИКЪТ НА ИСТИНАТА (правило на
                       репото); преводите минават през агента Преводач.
src/middleware.ts      Локализиран рутинг само за сайта; /u, /d, /api са извън
                       него. Чужд Host (собствен домейн, платени планове) се
                       пренаписва към /d/<host> → резолвира се по
                       Profile.customDomain.
src/app/(site)/[locale]/   Landing, login/register, dashboard, privacy/terms.
src/app/(public)/u/[slug]/ Публичен профил: език = ?hl → Accept-Language →
                           defaultLocale; hreflang alternates в metadata.
    .../l/[linkId]/route.ts  Клик: запис на ClickEvent + 302 redirect; тук е
                           „умната“ логика (APP по User-Agent, MUSIC по ?svc=).
src/lib/blocks.ts      Блокова система (по linkie.to): kinds LINK/HEADER/PHONE/
                       MAP/VIDEO/MUSIC/APP/FORM; parseBlockInput валидира и
                       нормализира входа (tel:, Google Maps URL, embed проверка);
                       videoEmbedSrc (YouTube nocookie/Vimeo allowlist).
                       FORM блокът пише в ContactMessage (публично действие с
                       honeypot; съобщенията се четат в дашборда).
src/app/actions/       Server actions (auth, profile, billing) — zod вход,
                       ownership проверки (where: { userId }), redirect с ?error=.
src/app/api/stripe/webhook/  ЕДИНСТВЕНОТО място, което дава планове —
                       подписан webhook (constructEvent), не success_url.
src/lib/plans.ts       Планове/комисиони: FREE 8% · PRO €4 4% · BUSINESS €9 0%
                       · FOUNDER €49 еднократно 0% + PROCESSING_FEE 1.9%+€0.30
                       (носи я продавачът; покрива Stripe таксите — checkout
                       ползва totalFeeCents). MIN_PRODUCT_PRICE_EUR=3. Лимити
                       (maxLocales, analyticsDays) се четат само оттук.
src/lib/auth.ts        Сесии: httpOnly cookie, sha256(token) в БД, bcrypt 12.
src/lib/slug.ts        Транслитерация BG→latin, RESERVED_SLUGS, валидация.
src/lib/ai.ts          „Преведи с AI“ (Gemini Flash, като mastilko): ключът е
                       само server-side (GEMINI_API_KEY); превежда липсващите
                       езици, НИКОГА не презаписва ръчни версии (upsert с
                       update:{}). Лимитът на плана важи и тук.
src/app/(public)/u/[slug]/qr/  Безплатен QR (SVG, акцентен цвят) — пакет qrcode.
```
Насрочване: Link.showFrom/showUntil + isBlockVisible() — проверява се и при
рендиране, и при клик. VCARD блокът връща .vcf през click route-а.

Качени изображения: src/lib/media.ts (sharp → webp, маха EXIF, ≤8 MB) →
DATA_DIR/uploads, сервирани от /media/[file] (стриктен allowlist на името).
Шрифтове: src/app/fonts.ts (next/font, self-hosted — нула външни заявки).

Стилов енджин: Profile.style (Json) + src/lib/style.ts (zod схема,
DEFAULT_STYLE, прощаващ parseStyle — невалидно поле пада към подразбирането;
backgroundCss/buttonCss/fontFamily/readableOn). Нова стилова опция = поле в
styleSchema + контрола в дашборда — БЕЗ миграция. hideBadge е само за платени
планове (пази се в updateStyleAction). Пер-блок цвят: meta.color; spotlight:
meta.featured (голяма карта със сияние). bgEffect = жива сцена на фона
(aurora/stars/gradient, чист CSS в globals.css „Публичният профил е жив“);
showViews = бадж „N посещения този месец“ (брои ClickEvent с linkId null —
без бисквитки). Бранд сияние при hover: BRAND_COLORS в brand-icons.tsx.
„Сподели“ = ShareButton.tsx (client; Web Share API, fallback QR + копиране).

Магазин (Stripe Connect Express): User.stripeAccountId + stripeChargesEnabled
(отключва се само от account.updated webhook-а). Product/ProductTranslation/
Purchase; actions/shop.ts (onboarding + CRUD + публичното
startProductPurchaseAction — сумата се чете САМО от базата). Checkout =
destination charge с application_fee = totalFeeCents(цена, план) =
комисиона по плана + такса обработка 1.9%+€0.30.
Доставка: /u/[slug]/delivery проверява сесията НА ЖИВО срещу Stripe
(payment_status === 'paid') преди redirect към deliveryUrl. Purchase се
записва идемпотентно само през подписания webhook.

## Правила на продукта

- **Нов език** = ред в `LOCALES` + `messages/<loc>.json` (може частичен —
  пада към en). За RTL добави локала и в `RTL_LOCALES` — нищо друго.
- **Никакви лични данни в ClickEvent** — без IP, без user agent, без
  fingerprinting. Това е продуктово обещание („аналитика без бисквитки“).
- Правата от плащане се дават **само** през Stripe webhook с проверен
  подпис. Founder не се отнема при изтекъл абонамент.
- Лимитите на плановете се четат от `src/lib/plans.ts` — не се хардкодват
  по страниците.
- Легалните текстове в `messages/*.json` (`legal.*`) са **чернови** —
  преди пускане минават през Правния Разбирач.
