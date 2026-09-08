import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo';
import { resolveLocale, type LocaleParams } from '@/lib/page-params';
import { JsonLd } from '@/components/JsonLd';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: 'faq' });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  return pageMetadata({ locale, path: '/faq', title: t('title'), description: tSeo('metaDescription') });
}

export default async function FaqPage(props: LocaleParams) {
  const locale = await resolveLocale(props);
  const t = await getTranslations('faq');
  const tc = await getTranslations('common');
  const items = t.raw('items') as Array<{ q: string; a: string }>;
  return (
    <div className="container-page py-12">
      <JsonLd data={breadcrumbJsonLd(locale, [{ name: tc('nav.home'), path: '/' }, { name: t('title'), path: '/faq' }])} />
      <JsonLd data={faqJsonLd(items)} />
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <div className="mt-8 max-w-3xl space-y-4">
        {items.map((item) => (
          <details key={item.q} className="card group">
            <summary className="cursor-pointer text-lg font-semibold text-targa-700">
              <h2 className="inline">{item.q}</h2>
            </summary>
            <p className="mt-3 text-slate-700">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
