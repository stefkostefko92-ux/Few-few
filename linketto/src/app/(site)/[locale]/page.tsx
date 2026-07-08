import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import type { Locale } from '@/i18n/locales';
import { PLANS } from '@/lib/plans';

const FEATURES = [
  'Lang',
  'Fee',
  'Analytics',
  'Trust',
  'Eu',
  'Domain',
] as const;

const PLAN_ORDER = ['free', 'pro', 'business', 'founder'] as const;

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
      <main className="mx-auto max-w-4xl px-6">
        <section className="py-20 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            {t('heroSubtitle')}
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href={`/${locale}/register`}
              className="rounded-full bg-linketto-600 px-6 py-3 font-semibold text-white hover:bg-linketto-700"
            >
              {t('ctaPrimary')}
            </Link>
            <a
              href="#pricing"
              className="rounded-full border border-slate-300 px-6 py-3 font-semibold text-slate-700 hover:border-slate-400"
            >
              {t('ctaSecondary')}
            </a>
          </div>
        </section>

        <section aria-labelledby="features">
          <h2 id="features" className="text-center text-2xl font-bold">
            {t('featuresTitle')}
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((key) => (
              <div
                key={key}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <h3 className="font-semibold text-linketto-700">
                  {t(`feature${key}Title`)}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {t(`feature${key}Body`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="mt-20">
          <h2 id="pricing-title" className="text-center text-2xl font-bold">
            {tPricing('title')}
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((planKey) => {
              const def = PLANS[planKey.toUpperCase() as keyof typeof PLANS];
              return (
                <div
                  key={planKey}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6"
                >
                  <h3 className="font-semibold">{tPricing(`${planKey}.name`)}</h3>
                  <p className="mt-2 text-3xl font-extrabold">
                    {tPricing(`${planKey}.price`)}
                    <span className="text-sm font-normal text-slate-500">
                      {def.oneTime
                        ? ` ${tPricing('oneTime')}`
                        : tPricing('perMonth')}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-linketto-600">
                    {tPricing(`${planKey}.fee`)} {tPricing('commission')}
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                    <li>{tPricing(`${planKey}.f1`)}</li>
                    <li>{tPricing(`${planKey}.f2`)}</li>
                    <li>{tPricing(`${planKey}.f3`)}</li>
                  </ul>
                  <Link
                    href={`/${locale}/register`}
                    className="mt-6 rounded-full border border-linketto-600 px-4 py-2 text-center text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
                  >
                    {tPricing('choose')}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <SiteFooter locale={locale as Locale} currentPath="" />
    </>
  );
}
