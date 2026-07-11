import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { CursorGlow } from '@/components/CursorGlow';
import { faqJsonLd, pageMetadata, siteJsonLd } from '@/lib/seo';
import {
  CheckIcon,
  ClapperboardIcon,
  CookieIcon,
  HandshakeIcon,
  HeartIcon,
  LanguagesIcon,
  LockIcon,
  MicIcon,
  ServerIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
} from '@/components/icons';
import type { Locale } from '@/i18n/locales';
import { BILLING_INTERVALS, PLANS } from '@/lib/plans';

// Максималната отстъпка (годишен план) — за маркетинговия ред в цените.
const ANNUAL_DISCOUNT =
  BILLING_INTERVALS.find((i) => i.id === 'annual')?.discountPercent ?? 0;

// Авторските икони на бранда (public/icons) в бели кръгли плочки с
// пулсиращо сияние. Самите полета „плуват“: всяка карта има свой наклон
// (--tilt), отместване, ритъм и закъснение — редът е нарочно счупен.
const FEATURES = [
  ['Lang', '/icons/feature-megaphone.png', '', '-2.5deg', '0s', '6.5s'],
  ['Ai', '/icons/feature-bookgear.png', 'lg:mt-12', '1.5deg', '0.8s', '7.5s'],
  ['Fee', '/icons/feature-money.png', 'lg:-mt-6', '3deg', '1.6s', '7s'],
  ['Qr', '/icons/feature-network.png', 'lg:mt-8', '-1.5deg', '2.4s', '8s'],
  ['Analytics', '/icons/feature-growth.png', 'lg:mt-2', '2deg', '0.4s', '7.2s'],
  ['Trust', '/icons/feature-hands.png', 'lg:-mt-9', '-3deg', '1.2s', '6.8s'],
  ['Eu', '/icons/feature-handshake.png', 'lg:mt-10', '2.5deg', '2s', '7.8s'],
  ['Domain', '/icons/feature-mask.png', 'lg:-mt-3', '-2deg', '2.8s', '6.6s'],
] as const;

const PLAN_ORDER = ['free', 'pro', 'business', 'founder'] as const;

// Чисто визуален телефонен mockup на профил — брандови имена, без превод.
const MOCK_LINKS = [
  ['YouTube', ClapperboardIcon],
  ['Podcast', MicIcon],
  ['Shop', ShoppingBagIcon],
  ['Tip', HeartIcon],
] as const;

// Поздрави на езиците на света — универсални, не се превеждат.
const GREETINGS = [
  ['Здравей', '-top-4 -left-6', '-6deg', '0s'],
  ['Hello', 'top-16 -right-10', '5deg', '1.2s'],
  ['Ciao', 'top-1/2 -left-14', '-4deg', '2.4s'],
  ['Hola', 'bottom-24 -right-8', '6deg', '0.6s'],
  ['Bonjour', 'bottom-2 -left-8', '-5deg', '1.8s'],
  ['Hallo', '-top-2 right-16', '4deg', '3s'],
  ['Olá', 'top-32 -left-16', '5deg', '3.6s'],
  ['Merhaba', 'bottom-40 -right-14', '-5deg', '4.2s'],
] as const;

// Звезди в нощното небе на hero-то: [top, left, размер px, ритъм, закъснение]
const STARS = [
  ['7%', '12%', 2, '4.2s', '0s'],
  ['12%', '78%', 3, '5.5s', '1.1s'],
  ['22%', '32%', 2, '6.2s', '2.3s'],
  ['9%', '55%', 2, '4.8s', '0.7s'],
  ['30%', '88%', 2, '5.1s', '1.8s'],
  ['38%', '6%', 3, '6.8s', '0.4s'],
  ['48%', '44%', 2, '4.4s', '2.9s'],
  ['58%', '16%', 2, '5.9s', '1.4s'],
  ['66%', '70%', 3, '4.6s', '3.4s'],
  ['74%', '38%', 2, '6.4s', '0.9s'],
  ['82%', '82%', 2, '5.3s', '2.1s'],
  ['86%', '10%', 2, '4.9s', '3.8s'],
  ['18%', '92%', 2, '6.1s', '2.6s'],
  ['52%', '94%', 2, '5.7s', '0.2s'],
] as const;

// Поздрави-стикери около финалната CTA — езици извън hero комплекта.
const CTA_PILLS = [
  ['Привіт', '-top-5 left-10', '-5deg', '0s'],
  ['こんにちは', '-top-4 right-16', '4deg', '1.5s'],
  ['안녕하세요', '-bottom-5 left-24', '5deg', '0.8s'],
  ['Γεια', '-bottom-4 right-10', '-4deg', '2.2s'],
] as const;

const MARQUEE =
  'Здравей · Hello · Ciao · Hola · Hallo · Bonjour · Olá · Merhaba · Ahoj · Cześć · Γεια · Привіт · こんにちは · 안녕하세요 · مرحبا · ';

const PLATFORM_MARQUEE =
  'YouTube · Instagram · TikTok · X · Twitch · Kick · Discord · Spotify · Snapchat · Threads · Facebook · Telegram · ';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  return pageMetadata(locale as Locale, '', {
    title: tSeo('metaTitle'),
    description: tSeo('metaDescription'),
    keywords: tSeo('keywords').split(', '),
  });
}

const FAQ_KEYS = ['faq1', 'faq2', 'faq3', 'faq4', 'faq5'] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('home');
  const tPricing = await getTranslations('pricing');
  const tSeo = await getTranslations('seo');

  const faqItems = FAQ_KEYS.map((key) => ({
    q: t(`${key}q`),
    a: t(`${key}a`),
  }));
  const jsonLd = [
    ...siteJsonLd({
      locale: locale as Locale,
      description: tSeo('metaDescription'),
      plans: PLAN_ORDER.map((planKey) => {
        const def = PLANS[planKey.toUpperCase() as keyof typeof PLANS];
        return {
          name: tPricing(`${planKey}.name`),
          priceEur: def.priceCents / 100,
        };
      }),
    }),
    faqJsonLd(faqItems),
  ];

  const TRUST = [
    [ServerIcon, t('trustEu')],
    [ShieldCheckIcon, t('trustGdpr')],
    [LockIcon, t('trustStripe')],
    [CookieIcon, t('trustCookies')],
  ] as const;

  // [цел на брояча, суфикс, етикет] — скролът навива цифрата от 0 до целта
  const STATS = [
    ['6', '+', t('statsLangsLabel')],
    ['29', '', t('statsBrandsLabel')],
    ['10', '', t('statsBlocksLabel')],
    ['0', '%', t('statsFeeLabel')],
  ] as const;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div aria-hidden className="scroll-progress" />
      <CursorGlow />
      <SiteHeader locale={locale as Locale} />
      <main>
        {/* ── HERO: жива aurora върху дълбоко нощно небе ─────────────── */}
        <section className="grain relative overflow-hidden bg-slate-950 text-white">
          <div aria-hidden className="animate-hue pointer-events-none absolute inset-0">
            <div className="aurora-conic absolute left-1/2 top-1/2 h-[64rem] w-[64rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70" />
            <div className="animate-aurora absolute -top-52 left-[-15%] h-[42rem] w-[42rem] rounded-full bg-linketto-600/40 blur-3xl" />
            <div className="animate-aurora-slow absolute -bottom-64 right-[-12%] h-[44rem] w-[44rem] rounded-full bg-violet-600/30 blur-3xl" />
            <div
              className="animate-aurora absolute left-1/3 top-1/4 h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/20 blur-3xl"
              style={{ animationDelay: '-9s' }}
            />
          </div>

          {/* звездно небе + комета */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {STARS.map(([top, left, size, dur, delay]) => (
              <span
                key={`${top}-${left}`}
                className="star"
                style={
                  {
                    top,
                    left,
                    width: size,
                    height: size,
                    '--dur': dur,
                    '--delay': delay,
                  } as React.CSSProperties
                }
              />
            ))}
            <span className="comet" style={{ top: '16%', left: '5%' }} />
          </div>

          <div className="relative mx-auto max-w-6xl px-6">
            <div className="grid items-center gap-16 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
              <div className="animate-rise text-center lg:text-start">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-sky-200 backdrop-blur">
                  <LanguagesIcon className="h-3.5 w-3.5" />
                  {t('heroBadge')}
                </p>
                <h1 className="title-shimmer mt-6 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight drop-shadow-[0_2px_30px_rgba(125,211,252,0.22)] sm:text-5xl lg:text-7xl">
                  {t('heroTitle')}
                </h1>
                <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300 lg:mx-0">
                  {t('heroSubtitle')}
                </p>
                <div className="mt-9 flex flex-wrap justify-center gap-4 lg:justify-start">
                  <Link
                    href={`/${locale}/register`}
                    className="btn-shine rounded-full bg-white px-7 py-3.5 font-semibold text-slate-900 shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-sky-400/30"
                  >
                    {t('ctaPrimary')}
                  </Link>
                  <a
                    href="#pricing"
                    className="rounded-full border border-white/30 px-7 py-3.5 font-semibold text-white backdrop-blur transition hover:border-white/60 hover:bg-white/5"
                  >
                    {t('ctaSecondary')}
                  </a>
                </div>
              </div>

              {/* телефон + плаващи поздрави */}
              <div className="phone-wrap relative mx-auto w-full max-w-[300px]">
                <div
                  aria-hidden
                  className="phone-glow pointer-events-none absolute -inset-10 rounded-full bg-gradient-to-br from-sky-500/40 via-indigo-500/30 to-fuchsia-500/30 blur-3xl"
                />
                {GREETINGS.map(([word, position, tilt, delay]) => (
                  <span
                    key={word}
                    aria-hidden
                    className={`animate-greet absolute ${position} z-10 hidden rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-sky-100 shadow-lg backdrop-blur-md sm:inline-block`}
                    style={
                      {
                        '--tilt': tilt,
                        '--delay': delay,
                      } as React.CSSProperties
                    }
                  >
                    {word}
                  </span>
                ))}
                <div className="animate-float">
                  <div className="phone-tilt rounded-[2.8rem] border-[10px] border-slate-900 bg-slate-900 shadow-[0_40px_90px_-20px_rgba(56,132,222,0.45)]">
                  <div className="rounded-[2.2rem] bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 px-5 pb-8 pt-7 text-center">
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-2xl font-bold ring-4 ring-white/20">
                      A
                    </div>
                    <p className="font-semibold">Anna</p>
                    <div className="mt-2 flex justify-center gap-1.5 text-[9px]">
                      {['BG', 'EN', 'IT', 'ES'].map((lang, index) => (
                        <span
                          key={lang}
                          className={`rounded-full px-2 py-0.5 ${
                            index === 0
                              ? 'bg-white/25 font-bold'
                              : 'bg-white/10 opacity-70'
                          }`}
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                    <div className="mt-5 space-y-2.5">
                      {MOCK_LINKS.map(([label, MockIcon]) => (
                        <div
                          key={label}
                          className="flex items-center justify-center gap-2 rounded-full border border-sky-400/60 bg-sky-400/15 px-4 py-2.5 text-xs font-semibold"
                        >
                          <MockIcon className="h-3.5 w-3.5" />
                          {label}
                        </div>
                      ))}
                    </div>
                    <p className="mt-6 text-[8px] uppercase tracking-[0.25em] opacity-40">
                      Linketto
                    </p>
                  </div>
                  </div>
                </div>
              </div>
            </div>

            {/* trust лента */}
            <div className="grid grid-cols-2 gap-4 border-t border-white/10 py-8 sm:grid-cols-4">
              {TRUST.map(([TrustIcon, label]) => (
                <p
                  key={label}
                  className="flex items-center justify-center gap-2.5 text-sm font-medium text-slate-300"
                >
                  <TrustIcon className="h-4 w-4 shrink-0 text-sky-300" />
                  {label}
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* ── MARQUEE: поздравите на света текат — под ъгъл ──────────── */}
        {/* Обвивката клипва наклонената лента — без нея ротацията
            разширява страницата и се появява хоризонтален скрол */}
        <div className="overflow-x-clip">
          <div
            className="marquee-band -mx-4 -rotate-1 scale-[1.02] overflow-hidden border-y border-slate-200 bg-gradient-to-r from-sky-50 via-violet-50 to-sky-50 py-3.5 shadow-sm"
            aria-hidden
          >
            <div className="animate-marquee flex w-max whitespace-nowrap text-sm font-semibold tracking-wide text-slate-500">
              <span>{MARQUEE.repeat(3)}</span>
              <span>{MARQUEE.repeat(3)}</span>
            </div>
            <div className="animate-marquee-reverse mt-2 flex w-max whitespace-nowrap text-xs font-medium tracking-wide text-slate-400">
              <span>{PLATFORM_MARQUEE.repeat(4)}</span>
              <span>{PLATFORM_MARQUEE.repeat(4)}</span>
            </div>
          </div>
        </div>

        {/* ── СТАТИСТИКИ ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {STATS.map(([value, suffix, label], index) => (
              <div
                key={label}
                className={`reveal-pop text-center ${
                  ['lg:-rotate-3', 'lg:translate-y-5 lg:rotate-2', 'lg:-translate-y-2 lg:rotate-1', 'lg:translate-y-7 lg:-rotate-2'][index]
                }`}
              >
                <p
                  className="bg-gradient-to-r from-linketto-600 to-violet-600 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent"
                  style={{ '--stat-target': value } as React.CSSProperties}
                >
                  <span aria-hidden className="stat-live" />
                  <span className="stat-static">{value}</span>
                  {suffix}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── ФУНКЦИИ ───────────────────────────────────────────────── */}
        <section aria-labelledby="features" className="mx-auto max-w-6xl px-6">
          <h2
            id="features"
            className="h2-draw text-center text-3xl font-bold tracking-tight text-slate-900"
          >
            {t('featuresTitle')}
          </h2>
          <div className="mt-14 grid items-start gap-x-5 gap-y-10 pb-10 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([key, iconSrc, offset, tilt, delay, dur], index) => (
              <div
                key={key}
                className={`reveal card-drift group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-linketto-500/40 hover:shadow-xl ${offset}`}
                style={
                  {
                    '--tilt': tilt,
                    '--delay': delay,
                    '--dur': dur,
                  } as React.CSSProperties
                }
              >
                <span
                  className="icon-pulse flex h-16 w-16 items-center justify-center rounded-full bg-white ring-1 ring-sky-200 transition duration-300 group-hover:-rotate-6 group-hover:scale-110"
                  style={{ animationDelay: `${index * 0.45}s` }}
                >
                  <Image
                    src={iconSrc}
                    alt=""
                    width={44}
                    height={44}
                    className="h-11 w-11"
                  />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">
                  {t(`feature${key}Title`)}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {t(`feature${key}Body`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── МАНИФЕСТ: доверието като обещание ──────────────────────── */}
        <section className="grain relative mt-20 overflow-hidden bg-slate-950 py-20 text-white">
          <div
            aria-hidden
            className="animate-aurora-slow pointer-events-none absolute -right-40 top-1/2 h-[30rem] w-[30rem] -translate-y-1/2 rounded-full bg-linketto-600/30 blur-3xl"
          />
          <span
            aria-hidden
            className="animate-float pointer-events-none absolute -top-2 left-4 select-none font-serif text-[11rem] leading-none text-sky-400/10"
          >
            „
          </span>
          <div className="reveal relative mx-auto max-w-3xl px-6 text-center">
            <HandshakeIcon className="mx-auto h-10 w-10 text-sky-300" />
            <h2 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">
              {t('manifestoTitle')}
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-slate-300">
              „{t('manifestoQuote')}“
            </p>
            <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-sky-300/80">
              — {t('manifestoBy')}
            </p>
          </div>
        </section>

        {/* ── ЦЕНИ ──────────────────────────────────────────────────── */}
        <section
          id="pricing"
          aria-labelledby="pricing-title"
          className="mx-auto max-w-6xl px-6 py-20"
        >
          <h2
            id="pricing-title"
            className="h2-draw text-center text-3xl font-bold tracking-tight text-slate-900"
          >
            {tPricing('title')}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-500">
            {tPricing('processingNote')} {tPricing('vatNote')}
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((planKey, index) => {
              const def = PLANS[planKey.toUpperCase() as keyof typeof PLANS];
              const highlight = planKey === 'pro';
              return (
                <div
                  key={planKey}
                  className={`reveal relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-lg ${
                    highlight
                      ? 'border-live shadow-xl shadow-linketto-600/25'
                      : 'card-drift border-slate-200'
                  }`}
                  style={
                    highlight
                      ? undefined
                      : ({
                          '--tilt': ['-1.2deg', '0deg', '1.2deg', '-0.8deg'][index],
                          '--delay': `${index * 0.9}s`,
                          '--dur': '8.5s',
                        } as React.CSSProperties)
                  }
                >
                  {highlight && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-linketto-600 to-violet-600 px-3 py-0.5 text-xs font-semibold text-white">
                      {tPricing('mostPopular')}
                    </span>
                  )}
                  <h3 className="font-semibold text-slate-900">
                    {tPricing(`${planKey}.name`)}
                  </h3>
                  <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900">
                    {tPricing(`${planKey}.price`)}
                    <span className="text-sm font-normal text-slate-500">
                      {def.oneTime
                        ? ` ${tPricing('oneTime')}`
                        : tPricing('perMonth')}
                    </span>
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-linketto-600">
                    {tPricing(`${planKey}.fee`)} {tPricing('commission')}
                  </p>
                  {!def.oneTime && def.priceCents > 0 && (
                    <p className="mt-1 text-xs font-medium text-green-600">
                      {tPricing('annualOffer', { percent: ANNUAL_DISCOUNT })}
                    </p>
                  )}
                  <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-600">
                    {(['f1', 'f2', 'f3'] as const).map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-linketto-600" />
                        {tPricing(`${planKey}.${feature}`)}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/${locale}/register`}
                    className={`mt-6 rounded-full px-4 py-2.5 text-center text-sm font-semibold transition ${
                      highlight
                        ? 'bg-linketto-600 text-white hover:bg-linketto-700'
                        : 'border border-linketto-600 text-linketto-700 hover:bg-linketto-50'
                    }`}
                  >
                    {tPricing('choose')}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── FAQ: отговори отпред — за хора и за AI (AEO) ───────────── */}
        <section
          aria-labelledby="faq-title"
          className="mx-auto max-w-3xl px-6 pb-20"
        >
          <h2
            id="faq-title"
            className="h2-draw text-center text-3xl font-bold tracking-tight text-slate-900"
          >
            {t('faqTitle')}
          </h2>
          <div className="mt-10 space-y-4">
            {faqItems.map((item, index) => (
              <details
                key={item.q}
                className="reveal group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-linketto-500/40 hover:shadow-md"
                open={index === 0}
              >
                <summary className="cursor-pointer list-none font-semibold text-slate-900 marker:content-none">
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── ФИНАЛНА CTA ВЪЛНА ─────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="relative">
            {CTA_PILLS.map(([word, position, tilt, delay]) => (
              <span
                key={word}
                aria-hidden
                className={`animate-greet absolute ${position} z-10 hidden rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-600 shadow-lg md:inline-block`}
                style={
                  {
                    '--tilt': tilt,
                    '--delay': delay,
                  } as React.CSSProperties
                }
              >
                {word}
              </span>
            ))}
          <div className="cta-live grain relative overflow-hidden rounded-3xl bg-gradient-to-br from-linketto-600 via-indigo-600 to-violet-600 px-8 py-16 text-center text-white shadow-2xl shadow-linketto-600/30">
            <div
              aria-hidden
              className="animate-aurora pointer-events-none absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-white/15 blur-3xl"
            />
            <h2 className="relative text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t('ctaTitle')}
            </h2>
            <Link
              href={`/${locale}/register`}
              className="btn-shine relative mt-8 inline-block rounded-full bg-white px-8 py-4 font-bold text-linketto-700 shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl"
            >
              {t('ctaButton')}
            </Link>
          </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale as Locale} currentPath="" />
    </>
  );
}
