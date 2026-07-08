import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import {
  ChartColumnIcon,
  CheckIcon,
  ClapperboardIcon,
  CoinsIcon,
  CookieIcon,
  GlobeIcon,
  HandshakeIcon,
  HeartIcon,
  LanguagesIcon,
  LockIcon,
  MicIcon,
  QrCodeIcon,
  ServerIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  SparklesIcon,
} from '@/components/icons';
import type { Locale } from '@/i18n/locales';
import { PLANS } from '@/lib/plans';

// Всяка функция със собствен цвят — жив, но подреден ритъм.
const FEATURES = [
  ['Lang', LanguagesIcon, 'bg-sky-100 text-sky-700'],
  ['Ai', SparklesIcon, 'bg-violet-100 text-violet-700'],
  ['Fee', CoinsIcon, 'bg-amber-100 text-amber-700'],
  ['Qr', QrCodeIcon, 'bg-emerald-100 text-emerald-700'],
  ['Analytics', ChartColumnIcon, 'bg-indigo-100 text-indigo-700'],
  ['Trust', HandshakeIcon, 'bg-rose-100 text-rose-700'],
  ['Eu', ShieldCheckIcon, 'bg-teal-100 text-teal-700'],
  ['Domain', GlobeIcon, 'bg-slate-200 text-slate-700'],
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

const MARQUEE =
  'Здравей · Hello · Ciao · Hola · Hallo · Bonjour · Olá · Merhaba · Ahoj · Cześć · Γεια · Привіт · こんにちは · 안녕하세요 · مرحبا · ';

const PLATFORM_MARQUEE =
  'YouTube · Instagram · TikTok · X · Twitch · Kick · Discord · Spotify · Snapchat · Threads · Facebook · Telegram · ';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('home');
  const tPricing = await getTranslations('pricing');

  const TRUST = [
    [ServerIcon, t('trustEu')],
    [ShieldCheckIcon, t('trustGdpr')],
    [LockIcon, t('trustStripe')],
    [CookieIcon, t('trustCookies')],
  ] as const;

  const STATS = [
    ['6+', t('statsLangsLabel')],
    ['29', t('statsBrandsLabel')],
    ['10', t('statsBlocksLabel')],
    ['0%', t('statsFeeLabel')],
  ] as const;

  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main>
        {/* ── HERO: жива aurora върху дълбоко нощно небе ─────────────── */}
        <section className="grain relative overflow-hidden bg-slate-950 text-white">
          <div aria-hidden className="animate-hue pointer-events-none absolute inset-0">
            <div className="animate-aurora absolute -top-52 left-[-15%] h-[42rem] w-[42rem] rounded-full bg-linketto-600/40 blur-3xl" />
            <div className="animate-aurora-slow absolute -bottom-64 right-[-12%] h-[44rem] w-[44rem] rounded-full bg-violet-600/30 blur-3xl" />
            <div
              className="animate-aurora absolute left-1/3 top-1/4 h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/20 blur-3xl"
              style={{ animationDelay: '-9s' }}
            />
          </div>

          <div className="relative mx-auto max-w-6xl px-6">
            <div className="grid items-center gap-16 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
              <div className="animate-rise text-center lg:text-start">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-sky-200 backdrop-blur">
                  <LanguagesIcon className="h-3.5 w-3.5" />
                  {t('heroBadge')}
                </p>
                <h1 className="title-shimmer mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
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

        {/* ── MARQUEE: поздравите на света текат ─────────────────────── */}
        <div
          className="overflow-hidden border-y border-slate-200 bg-gradient-to-r from-sky-50 via-violet-50 to-sky-50 py-3.5"
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

        {/* ── СТАТИСТИКИ ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {STATS.map(([value, label]) => (
              <div key={label} className="reveal-pop text-center">
                <p className="bg-gradient-to-r from-linketto-600 to-violet-600 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent">
                  {value}
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
            className="text-center text-3xl font-bold tracking-tight text-slate-900"
          >
            {t('featuresTitle')}
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([key, FeatureIcon, chip]) => (
              <div
                key={key}
                className="reveal group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1.5 hover:border-linketto-500/40 hover:shadow-xl"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition duration-300 group-hover:rotate-6 group-hover:scale-110 ${chip}`}
                >
                  <FeatureIcon className="h-5 w-5" />
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
            className="text-center text-3xl font-bold tracking-tight text-slate-900"
          >
            {tPricing('title')}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-500">
            {tPricing('processingNote')}
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((planKey) => {
              const def = PLANS[planKey.toUpperCase() as keyof typeof PLANS];
              const highlight = planKey === 'pro';
              return (
                <div
                  key={planKey}
                  className={`reveal relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-lg ${
                    highlight
                      ? 'border-linketto-600 shadow-lg shadow-linketto-600/10 ring-2 ring-linketto-600'
                      : 'border-slate-200'
                  }`}
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

        {/* ── ФИНАЛНА CTA ВЪЛНА ─────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
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
        </section>
      </main>
      <SiteFooter locale={locale as Locale} currentPath="" />
    </>
  );
}
