import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { pageMetadata, organizationJsonLd, websiteJsonLd, softwareAppJsonLd } from '@/lib/seo';
import { resolveLocale, type LocaleParams } from '@/lib/page-params';
import { JsonLd } from '@/components/JsonLd';
import { PlateDemo } from '@/components/PlateDemo';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'seo' });
  return pageMetadata({ locale: locale as 'it', path: '/', title: t('metaTitle'), description: t('metaDescription') });
}

const FEATURES = ['verified', 'templates', 'fine', 'noGps', 'logbook', 'qr'] as const;
const STEPS = ['step1', 'step2', 'step3'] as const;

export default async function HomePage(props: LocaleParams) {
  const locale = await resolveLocale(props);
  const t = await getTranslations('home');
  const tc = await getTranslations('common');
  const tSeo = await getTranslations('seo');

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd(locale, tSeo('metaDescription'))} />
      <JsonLd data={softwareAppJsonLd(locale, tSeo('metaDescription'))} />

      <section className="bg-gradient-to-b from-targa-50 to-slate-50">
        <div className="container-page grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-targa-700 ring-1 ring-targa-100">
              {t('heroBadge')}
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight text-targa-900 md:text-5xl">{t('heroTitle')}</h1>
            <p className="mt-4 text-lg text-slate-700">{t('heroText')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/scadenze" className="btn-primary">{tc('cta.tryCalculator')}</Link>
              <Link href="/come-funziona" className="btn-secondary">{tc('cta.learnMore')}</Link>
            </div>
          </div>
          <PlateDemo />
        </div>
      </section>

      <section className="container-page py-16">
        <h2 className="text-2xl font-bold">{t('pillarsTitle')}</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <article className="card">
            <h3 className="text-xl font-semibold text-targa-700">{t('pillar1Title')}</h3>
            <p className="mt-2 text-slate-700">{t('pillar1Text')}</p>
          </article>
          <article className="card">
            <h3 className="text-xl font-semibold text-targa-700">{t('pillar2Title')}</h3>
            <p className="mt-2 text-slate-700">{t('pillar2Text')}</p>
          </article>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container-page">
          <h2 className="text-2xl font-bold">{t('featuresTitle')}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f} className="rounded-xl border border-slate-100 bg-slate-50 p-5">
                <h3 className="font-semibold text-slate-900">{t(`features.${f}.title`)}</h3>
                <p className="mt-2 text-sm text-slate-700">{t(`features.${f}.text`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <h2 className="text-2xl font-bold">{t('howTitle')}</h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s} className="card">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-targa-600 font-bold text-white">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{t(`how.${s}.title`)}</h3>
              <p className="mt-2 text-sm text-slate-700">{t(`how.${s}.text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-targa-900 py-16 text-white">
        <div className="container-page">
          <h2 className="text-2xl font-bold">{t('trustTitle')}</h2>
          <p className="mt-3 max-w-3xl text-targa-100">{t('trustText')}</p>
          <Link href="/sicurezza" className="mt-6 inline-block rounded-lg bg-white px-5 py-3 font-semibold text-targa-700">
            {tc('nav.safety')}
          </Link>
        </div>
      </section>

      <section className="container-page py-16 text-center">
        <h2 className="text-2xl font-bold">{t('ctaTitle')}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-700">{t('ctaText')}</p>
        <Link href="/scadenze" className="btn-primary mt-6">{tc('cta.tryCalculator')}</Link>
      </section>
    </>
  );
}
