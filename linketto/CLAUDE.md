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
                       LOCALE_NAMES, OG_LOCALE, RTL_LOCALES, bestLocale,
                       localeFromGeo — избор по IP държава). 27
                       локала: 24 ЕС езика + диалекти nap/scn/lmo (диалектите
                       са само за РЪЧЕН избор — не се избират автоматично).
                       Правните
                       текстове (legal.*) са родни само за bg/en/it/es/de/fr;
                       за останалите падат към en (deepMerge) до правен
                       преглед. Диалектите nap/scn/lmo са best-effort.
src/i18n/request.ts    next-intl: непълни преводи падат към en (deepMerge).
messages/<loc>.json    UI низове. bg е ИЗТОЧНИКЪТ НА ИСТИНАТА (правило на
                       репото); преводите минават през агента Преводач.
src/middleware.ts      Локализиран рутинг само за сайта; /u, /d, /api са извън
                       него. Автоматичен избор на език по IP държава
                       (cf-ipcountry, x-vercel-ip-country) за път без езиков
                       префикс: ръчен избор (NEXT_LOCALE cookie) → geo →
                       Accept-Language. Диалектите nap/scn/lmo НЕ се избират
                       автоматично (Италия → it). Чужд Host (собствен домейн, платени планове) се
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

SEO: src/lib/seo.ts (SITE_URL, pageMetadata → canonical+hreflang за 6-те
локала, siteJsonLd/faqJsonLd). Профилите: profileMetadata (OG, canonical,
noindex при 18+ линк) + ProfilePage/Person JSON-LD. sitemap.ts (hreflang
alternates, без 18+ профили), robots.ts (AI ботове изрично allow),
public/llms.txt. Правно: DSA сигнали = /u/[slug]/report (модел Report,
actions/report.ts, категории в src/lib/report.ts); чл. 13 бележка под FORM
блока; чекбокс waiver при покупка (валидира се в shop.ts); ContactMessage
се чисти след 12 мес.; legal.* текстовете са пълни (одитирани 2026-07-08).

Админ: /[locale]/admin (noindex, robots disallow) — само за имейли от env
ADMIN_EMAILS (src/lib/admin.ts requireAdmin; НИКАКВИ админ флагове в БД).
actions/admin.ts: бан/отбан (Profile.bannedAt — баннат = notFound на ВСИЧКИ
публични маршрути + извън sitemap, без публичен банер), смяна на
имейл/име/план, нова парола (bcrypt 12; старата не се вижда; всички сесии
се прекратяват), принудителен изход, пълно изтриване на акаунт (каскадно,
не и себе си), публикуване/сваляне, махане на домейн, resolve на DSA
сигнали; горе — платформена статистика. Плащания: checkout-ът НЕ ограничава
payment_method_types (карти/wallets навсякъде; за планове доп. методи от
Stripe Dashboard). ВНИМАНИЕ: за магазина (destination charges) PayPal НЕ се
поддържа от Stripe — само карти; Revolut Pay за проверка. PayPal/Revolut като
лични бакшиши: revolut.me/paypal.me имат бранд икони (не минават през нас).
Purchase.stripePaymentIntentId/deliveredAt/refundedAt/disputedAt; доставка по
имейл от webhook-а (fulfilProduct, lib/email.ts Resend — no-op без ключ);
webhook слуша и charge.refunded/dispute.created/account.application.deauthorized;
refund с reverse_transfer в adminRefundPurchaseAction. LoginEvent = IP при вход/регистрация (logLoginIp в
actions/auth.ts, 90 дни, декларирано в политиката; НЕ важи за посетители).

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

Периоди: plans.ts BILLING_INTERVALS (месец/3/6/12м, отстъпка 0/10/15/20%);
intervalPriceCents/effectiveMonthlyCents/stripePriceEnvFor. billing.ts избира
Price ID по план+период (Founder е еднократен). Реферал бонусът е процент
(REFERRAL_PERCENT=15) от session.amount_total — по-дълъг период → по-голям бонус.
Теглене: REFERRAL_MIN_PAYOUT_CENTS=10000 (€100); requestPayoutAction снапшотва
баланса в ReferralPayout и нулира referralCreditCents (транзакция, под праг = грешка);
админът маркира платено (adminMarkPayoutPaidAction).
Реферали: lib/referral.ts (referralRewardCents по план, generateReferralCode).
User.referralCode/referredById/referralCreditCents + модел Referral (ledger,
unique referredUserId). registerAction обвързва реферера от ?ref; webhook-ът
начислява бонуса при платен план (rewardReferrer, идемпотентно). Дашборд:
ReferralCard + ensureReferralCodeAction за стари профили. Кредитът се вижда
и в админ панела (за изплащане).

Транзакционен имейл: src/lib/email.ts (Resend HTTP API; deliveryEmailHtml/
deliverySubject са локализирани на 6-те езика по Purchase.locale — езикът
на купувача; линква и към печатната разписка). AI преводът (lib/ai.ts)
покрива и продуктите (заглавие+описание). Health probe: /api/health.
Deploy чеклист: DEPLOY.md.

Разписка: src/lib/receipt.ts (родни низове bg/en/it/es/de/fr + fallback en)
+ /u/[slug]/receipt (noindex; чете Purchase по stripeSessionId; продавач/
платформа/купувач/№/продукт/промо код/сума/статут; печат→PDF през браузъра,
PrintButton.tsx). Продавачът е merchant-of-record → това е потвърждение за
покупка, НЕ данъчна фактура (ДДС е негова отговорност).

Промо кодове: src/lib/coupon.ts (normalizeCouponCode, isCouponUsable,
discountedPriceCents — никога под минималния заряд на Stripe). Модел Coupon
(@@unique([profileId, code]), maxRedemptions/timesRedeemed/expiresAt).
Отстъпката се ПРЕИЗЧИСЛЯВА на сървъра в startProductPurchaseAction;
webhook-ът брои ползването веднъж. CRUD: actions/shop.ts (по userId).

Аналитика: dashboard/analytics/page.tsx (детайлен таб — $queryRaw дневна
поредица + groupBy разбивки; src/lib/analytics.ts: fillDailySeries/ctr/
seriesMax/conversionRate). „Езикова дупка" (src/lib/language-gap.ts:
languageDemand, localeForCountry в locales.ts) кръстосва държавите на
посетителите с наличните преводи → подкана за AI превод на липсващите. И
двете четат само ClickEvent (без бисквитки).

Магазин (Stripe Connect Express): User.stripeAccountId + stripeChargesEnabled
(отключва се само от account.updated webhook-а). Product/ProductTranslation/
Purchase; actions/shop.ts (onboarding + CRUD + публичното
startProductPurchaseAction — сумата се чете САМО от базата). Checkout =
destination charge с application_fee = totalFeeCents(цена, план) =
комисиона по плана + такса обработка 1.9%+€0.30, + on_behalf_of =
създателя (merchant-of-record: трансгранични продавачи + ДДС отговорността
е на продавача). fee е capped на цена-1 (Stripe инвариант).
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
