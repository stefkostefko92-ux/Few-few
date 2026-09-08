import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata, breadcrumbJsonLd } from '@/lib/seo';
import { resolveLocale, type LocaleParams } from '@/lib/page-params';
import { JsonLd } from '@/components/JsonLd';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: 'safety' });
  return pageMetadata({ locale, path: '/sicurezza', title: t('title'), description: t('intro') });
}

export default async function SafetyPage(props: LocaleParams) {
  const locale = await resolveLocale(props);
  const t = await getTranslations('safety');
  const tc = await getTranslations('common');
  const principles = t.raw('principles') as Array<{ title: string; text: string }>;

  return (
    <div className="container-page py-12">
      <JsonLd data={breadcrumbJsonLd(locale, [{ name: tc('nav.home'), path: '/' }, { name: t('title'), path: '/sicurezza' }])} />
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-3 max-w-3xl text-slate-700">{t('intro')}</p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {principles.map((p) => (
          <article key={p.title} className="card">
            <h2 className="text-lg font-semibold text-targa-700">{p.title}</h2>
            <p className="mt-2 text-slate-700">{p.text}</p>
          </article>
        ))}
      </div>
      <p className="mt-10 text-sm text-slate-500">{t('legalNote')}</p>
    </div>
  );
}
