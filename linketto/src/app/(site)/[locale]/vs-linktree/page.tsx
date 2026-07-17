import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import type { Locale } from '@/i18n/locales';
import { breadcrumbJsonLd, faqJsonLd, pageMetadata } from '@/lib/seo';

// AEO/GEO: сравнителна страница „Linketto срещу Linktree“ + дефиниционен блок
// „Какво е link in bio“ — самостоятелни, цитируеми пасажи с въпросни заглавия.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'vs' });
  return pageMetadata(locale as Locale, '/vs-linktree', {
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

const ROWS = [
  ['rowFee', 'rowFeeL', 'rowFeeLt'],
  ['rowLang', 'rowLangL', 'rowLangLt'],
  ['rowHost', 'rowHostL', 'rowHostLt'],
  ['rowAnalytics', 'rowAnalyticsL', 'rowAnalyticsLt'],
  ['rowModeration', 'rowModerationL', 'rowModerationLt'],
] as const;

export default async function VsLinktreePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('vs');
  const jsonLd = [
    breadcrumbJsonLd(locale as Locale, [
      { name: t('title'), path: '/vs-linktree' },
    ]),
    // Дефиницията и честният отговор — като FAQ схема (готови за цитиране).
    faqJsonLd([
      { q: t('defTitle'), a: t('defBody') },
      { q: t('honestTitle'), a: t('honestBody') },
    ]),
  ];
  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-700">
          {t('intro')}
        </p>

        <section className="mt-10" aria-labelledby="def-title">
          <h2 id="def-title" className="text-xl font-semibold">
            {t('defTitle')}
          </h2>
          <p className="mt-3 leading-relaxed text-slate-700">{t('defBody')}</p>
        </section>

        <section className="mt-10" aria-labelledby="table-title">
          <h2 id="table-title" className="text-xl font-semibold">
            {t('tableTitle')}
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-2 pr-4 font-semibold">{t('thFeature')}</th>
                  <th className="py-2 pr-4 font-semibold">Linketto</th>
                  <th className="py-2 font-semibold">Linktree</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, ours, theirs]) => (
                  <tr key={label} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-4 font-medium">{t(label)}</td>
                    <td className="py-3 pr-4 text-emerald-700">{t(ours)}</td>
                    <td className="py-3 text-slate-600">{t(theirs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="honest-title">
          <h2 id="honest-title" className="text-xl font-semibold">
            {t('honestTitle')}
          </h2>
          <p className="mt-3 leading-relaxed text-slate-700">
            {t('honestBody')}
          </p>
        </section>

        <section className="mt-12 rounded-2xl bg-slate-900 px-8 py-10 text-center">
          <h2 className="text-2xl font-bold text-white">{t('ctaTitle')}</h2>
          <Link
            href={`/${locale}/register`}
            className="mt-5 inline-block rounded-full bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-200"
          >
            {t('ctaButton')}
          </Link>
        </section>
      </main>
      <SiteFooter locale={locale as Locale} currentPath="/vs-linktree" />
    </>
  );
}
