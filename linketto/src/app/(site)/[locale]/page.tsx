import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import type { Locale } from '@/i18n/locales';
import { PLANS } from '@/lib/plans';

const FEATURES = [
  ['Lang', '🌍'],
  ['Ai', '✨'],
  ['Fee', '💶'],
  ['Qr', '📇'],
  ['Analytics', '📊'],
  ['Trust', '🤝'],
  ['Eu', '🇪🇺'],
  ['Domain', '🌐'],
] as const;

const PLAN_ORDER = ['free', 'pro', 'business', 'founder'] as const;

// Чисто визуален телефонен mockup на профил — брандови имена, без превод.
const MOCK_LINKS = ['🎬 YouTube', '🎧 Podcast', '🛍 Shop', '💖 Tip'];

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('home');
  const tPricing = await getTranslations('pricing');

  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main className="relative overflow-hidden">
        {/* меки цветни петна зад hero-то */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[52rem] -translate-x-2/3 rounded-full bg-linketto-100 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 right-[-10rem] h-[26rem] w-[26rem] rounded-full bg-sky-100 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-6">
          <section className="grid items-center gap-14 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
            <div className="text-center lg:text-start">
              <Image
                src="/logo.png"
                alt=""
                width={264}
                height={100}
                priority
                className="mx-auto mb-8 h-auto w-52 lg:mx-0"
              />
              <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                {t('heroTitle')}
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
                {t('heroSubtitle')}
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-4 lg:justify-start">
                <Link
                  href={`/${locale}/register`}
                  className="rounded-full bg-linketto-600 px-7 py-3.5 font-semibold text-white shadow-lg shadow-linketto-600/25 transition hover:-translate-y-0.5 hover:bg-linketto-700 hover:shadow-xl"
                >
                  {t('ctaPrimary')}
                </Link>
                <a
                  href="#pricing"
                  className="rounded-full border border-slate-300 bg-white/70 px-7 py-3.5 font-semibold text-slate-700 backdrop-blur transition hover:border-slate-400"
                >
                  {t('ctaSecondary')}
                </a>
              </div>
            </div>

            {/* телефонен mockup */}
            <div className="mx-auto w-full max-w-[300px]">
              <div className="rounded-[2.8rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
                <div className="rounded-[2.2rem] bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 px-5 pb-8 pt-7 text-center text-white">
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-2xl font-bold ring-4 ring-white/20">
                    A
                  </div>
                  <p className="font-semibold">Anna ✦</p>
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
                    {MOCK_LINKS.map((label) => (
                      <div
                        key={label}
                        className="rounded-full border border-sky-400/60 bg-sky-400/15 px-4 py-2.5 text-xs font-semibold"
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <p className="mt-6 text-[8px] uppercase tracking-[0.25em] opacity-40">
                    ✦ Linketto
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="features" className="pb-4">
            <h2
              id="features"
              className="text-center text-3xl font-bold tracking-tight text-slate-900"
            >
              {t('featuresTitle')}
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(([key, icon]) => (
                <div
                  key={key}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-linketto-50 text-xl">
                    {icon}
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

          <section id="pricing" aria-labelledby="pricing-title" className="py-20">
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
                    className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-lg ${
                      highlight
                        ? 'border-linketto-600 ring-2 ring-linketto-600'
                        : 'border-slate-200'
                    }`}
                  >
                    {highlight && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-linketto-600 px-3 py-0.5 text-xs font-semibold text-white">
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
                          <span className="text-linketto-600">✓</span>
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
        </div>
      </main>
      <SiteFooter locale={locale as Locale} currentPath="" />
    </>
  );
}
