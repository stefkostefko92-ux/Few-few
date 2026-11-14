# linketto/ — многоезичният „link in bio“

Linketto е глобален конкурент на Linktree: една публична страница
`/u/<slug>` с всичките линкове на създателя, която **говори езика на всеки
посетител**. Диференциатори (валидирани от проучването в
`research/link-in-bio/`): многоезичност навсякъде (профил с версии на всички езици),
EU хостинг/GDPR, аналитика без бисквитки, без комисиони (продуктите водят към
собствения линк за плащане на създателя), прозрачна модерация без публични
„banned“ банери.

_Stack: Next.js 15 (App Router) · React 19 · TypeScript strict · Prisma ·
PostgreSQL · Tailwind · next-intl · Revolut Business (Merchant API) · Brevo. Конвенциите на zabobovdol.
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

Env: виж `.env.example`. Ключовете на Revolut/Brevo са на Carbon Stealth VCC —
**само през env на сървъра, никога в кода**.

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
src/app/api/revolut/webhook/ Подписан уебхук на Revolut (HMAC върху суровото
                       тяло) → settlePlanOrder (lib/plan-order-service.ts) чете
                       поръчката на живо и дава плана с CAS pending→completed.
                       ЕДИНСТВЕНИТЕ места, които дават план: той и
                       /api/cron/plans (висящи поръчки) — никога redirect-ът.
src/lib/plans.ts       Планове: FREE · PRO €4/мес. · BUSINESS €9/мес. · FOUNDER
                       €49 завинаги; периоди 1/3/6/12 мес. (−0/10/15/20%). Без
                       комисиони. Лимити (maxLocales, analyticsDays…) — само оттук.
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
блока; ContactMessage
се чисти след 12 мес.; legal.* текстовете са пълни (одитирани 2026-07-08).

Админ: /[locale]/admin (noindex, robots disallow) — само за имейли от env
ADMIN_EMAILS (src/lib/admin.ts requireAdmin; НИКАКВИ админ флагове в БД).
actions/admin.ts: бан/отбан (Profile.bannedAt — баннат = notFound на ВСИЧКИ
публични маршрути + извън sitemap, без публичен банер), смяна на
имейл/име/план, нова парола (bcrypt 12; старата не се вижда; всички сесии
се прекратяват), принудителен изход, пълно изтриване на акаунт (каскадно,
не и себе си), публикуване/сваляне, махане на домейн, resolve на DSA
сигнали; горе — платформена статистика; „Поръчки на планове“ с пълно връщане на пари
(adminRefundPlanOrderAction → refund с Idempotency-Key + markPlanOrderRefunded: планът и
реферал бонусът по поръчката се сторнират). LoginEvent = IP при вход/регистрация (logLoginIp в
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

Плащане на плановете (Revolut, spec §7 P1–P13): `actions/billing.ts` startCheckoutAction —
checkPurchase (lib/plan-orders.ts; FOUNDER не се купува пак, по-нисък план при активен —
не), ДДС (lib/vat.ts: под €10 000 трансгранично → BG 20%; над — fail closed
`error=payments`), PlanOrder pending → `POST /api/orders` (сума само от plans.ts,
референция = PlanOrder.id) → redirect към checkout_url. applyPaidOrder: същият план
удължава от края; по-висок прехвърля оставащите дни × цена; FOUNDER → без изтичане.
`/api/cron/plans` (Bearer CRON_SECRET, дневно): висящи поръчки 15 мин.–3 дни,
изтекли → FREE + applyPlanLimits, напомняния 7/1 ден (lib/plan-reminder.ts, 6 езика).
Без абонамент и без автоматично таксуване. Уреждането (lib/plan-order-service.ts) заключва
реда на потребителя, пуска checkPurchase ОТНОВО (иначе → `conflict`: платена, неприложена),
пази снимка prevPlan/prevExpiresAt и праща потвърждение (lib/plan-confirmation.ts, P14).
Връщане: само от /admin → refund поръчка при Revolut (`refund_pending`, до 2 дни) → при
`completed` планът се връща към снимката (отпада само платеното с поръчката). Реферал
бонусът (REFERRAL_PERCENT=15 от платената сума) е в същата транзакция.
Теглене: REFERRAL_MIN_PAYOUT_CENTS=10000 (€100); requestPayoutAction снапшотва
баланса в ReferralPayout и нулира referralCreditCents (транзакция, под праг = грешка);
админът маркира платено (adminMarkPayoutPaidAction).
Реферали: lib/referral.ts (referralRewardCents по план, generateReferralCode).
User.referralCode/referredById/referralCreditCents + модел Referral (ledger,
unique referredUserId, planOrderId). registerAction обвързва реферера от ?ref;
settlePlanOrder начислява бонуса при първата платена поръчка (идемпотентно). Дашборд:
ReferralCard + ensureReferralCodeAction за стари профили. Кредитът се вижда
и в админ панела (за изплащане).

Транзакционен имейл: src/lib/email.ts (Brevo API v3, `sendEmail` → 201; без
BREVO_API_KEY/валиден EMAIL_FROM = no-op). Brevo добавя собствен List-Unsubscribe —
стандартни заглавия не се подават. AI преводът (lib/ai.ts) покрива и продуктите
(заглавие+описание). Health probe: /api/health. Deploy чеклист: DEPLOY.md.

Аналитика: dashboard/analytics/page.tsx (детайлен таб — $queryRaw дневна
поредица + groupBy разбивки; src/lib/analytics.ts: fillDailySeries/ctr/
seriesMax/conversionRate). „Езикова дупка" (src/lib/language-gap.ts:
languageDemand, localeForCountry в locales.ts) кръстосва държавите на
посетителите с наличните преводи → подкана за AI превод на липсващите. И
двете четат само ClickEvent (без бисквитки).

Продукти (решение О-1, 2026-11-14): витрина без плащане през нас — Product.externalUrl
(само https, lib/external-url.ts) + цена + многоезично заглавие/описание; на профила е
`<a rel="nofollow noopener noreferrer ugc">`, показват се само активни с линк. CRUD в
actions/shop.ts (по userId); статут търговец/частно лице (Дир. 2011/83 чл. 6а). Старите
модели Purchase/Entitlement/Lesson/Coupon остават в схемата празни (адитивно).

Жизнен цикъл на данните: счетоводните записи НЕ се трият — `PlanOrder` (и старите
`Purchase`/`Entitlement`) са `onDelete: Restrict`; `lib/account-erasure.ts` анонимизира
акаунт с поръчки/изплатени бонуси вместо да го изтрие (иначе — каскадно изтриване). Сроковете от
политиката са в `lib/retention-days.ts` (единен източник; cron SQL в DEPLOY §9).
Окончателно сваляне на план (изтекъл период, пълен refund, админ
смяна; НЕ временен спор — `limitsOnDowngrade`, billing-spec §9.5) → `lib/plan-limits.ts`
спира платените функции (домейн/бадж/излишни профили; чиста логика в
`plan-limits-core.ts`; флаговете са в `PlanDef`). Публичните форми (контакт/
резервация/бюлетин/анкета) и входът минават през `lib/rate-limit.ts` (в паметта на
процеса, чиста логика в `limiter.ts`; доверен IP = `X-Real-IP`/последен XFF).
Действията в дашборда връщат към активния профил през `dash()` (`lib/dashboard-url.ts`,
чете `?p` от Referer).

Растеж (2026-10-23): **вирусен бадж** на безплатните профили → `/<език>/register?ref=<реферал на собственика>`
(абсолютен URL — работи и на собствен/кратък домейн). **Кратък домейн** `PROFILE_HOST` →
`lib/profile-url.ts` (`profileUrl()` за споделяне/QR/vCard/табло; canonical/sitemap/плащане/имейли
остават на `PUBLIC_BASE_URL`); middleware пренаписва `/<slug>` → `/u/<slug>`; затова `RESERVED_SLUGS`
съдържа и езиковите кодове. **OG карта** на всеки профил: `/u/[slug]/og` (next/og, Inter woff от
`src/assets/og/` — кирилица/гръцки; само наш `/media` аватар през sharp, без външни заявки;
`lib/og-text.ts` маха знаците извън шрифта, иначе next/og тегли от CDN). **„Запази си името“** в hero-то
(`ClaimHandle` + `GET /api/handle`, лимит по IP) → регистрацията създава профила веднага (`handle`).
**Шаблони по ниша** `lib/templates.ts` (само визуален пресет; съдържанието и платените настройки се пазят).
**Импорт от Linktree** `actions/import.ts` + чист парсер `lib/linktree-import.ts` (`__NEXT_DATA__`) +
`lib/safe-fetch.ts` (хостът е фиксиран, без redirect, таймаут, таван на размера; аватар само от
`ugc.production.linktr.ee` → sharp). **Безплатни инструменти** `/[locale]/tools` (QR — изцяло в браузъра;
AI био — `actions/tools.ts`, лимит по IP + дневен таван, нищо не се пази). **Сравнения** `/[locale]/vs/<id>`
— фактите САМО в `lib/comparisons.ts` с дата и първоизточник (Дир. 2006/114 чл. 4); твърдения без
източник не влизат („Linktree е само на английски“ и „12/9%“ вече НЕ са верни — да не се връщат).
**Седмичен отчет** „езикова дупка“: `lib/digest.ts` (чисти функции) + `POST /api/cron/digest`
(Bearer `CRON_SECRET`, дневен cron, ≤1 на ~седмица по `User.lastDigestAt`) + отписване с 1 клик
`/api/digest/unsubscribe` (HMAC подпис, GET без странични ефекти, POST = RFC 8058) и от таблото
(`User.digestOptOut`). **PWA**: `src/app/manifest.ts` + `public/icons/app-*.png` + `src/app/apple-icon.png`
(без service worker — данните са живи).

## Правила на продукта

- **Нов език** = ред в `LOCALES` + `messages/<loc>.json` (може частичен —
  пада към en). За RTL добави локала и в `RTL_LOCALES` — нищо друго.
- **Никакви лични данни в ClickEvent** — без IP, без user agent, без
  fingerprinting. Това е продуктово обещание („аналитика без бисквитки“).
- Правата от плащане се дават **само** след поръчка, прочетена на живо от Revolut
  (`GET /api/orders/{id}`: `completed`, точна сума, EUR) — през подписания уебхук или
  cron-а; никога от redirect-а. FOUNDER не изтича.
- **Предплатени планове** (2026-11-14): чистите решения са в `src/lib/plan-orders.ts`
  (checkPurchase/applyPaidOrder/expiryAction), подписът/тялото в `src/lib/revolut-core.ts`,
  ДДС в `src/lib/vat.ts`, прилагането (условни записи) в `src/lib/plan-order-service.ts`.
  Критериите P1–P13 са в `docs/revolut-migration-spec.md` §7. Ядро: тестове първо, после код.
- Лимитите на плановете се четат от `src/lib/plans.ts` — не се хардкодват
  по страниците.
- Легалните текстове в `messages/*.json` (`legal.*`) са **чернови** —
  преди пускане минават през Правния Разбирач.
