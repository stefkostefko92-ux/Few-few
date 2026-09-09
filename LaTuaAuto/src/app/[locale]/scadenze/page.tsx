import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata, breadcrumbJsonLd } from '@/lib/seo';
import { resolveLocale, type LocaleParams } from '@/lib/page-params';
import { JsonLd } from '@/components/JsonLd';
import { ScadenzeCalculator } from '@/components/ScadenzeCalculator';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: 'deadlines' });
  return pageMetadata({
    locale,
    path: '/scadenze',
    title: t('title'),
    description: t('intro'),
    keywords: ['calcolo revisione', 'scadenza patente', 'gomme invernali 15 novembre', 'multa 5 giorni'],
  });
}

export default async function DeadlinesPage(props: LocaleParams) {
  const locale = await resolveLocale(props);
  const t = await getTranslations('deadlines');
  const tc = await getTranslations('common');
  return (
    <div className="container-page py-12">
      <JsonLd data={breadcrumbJsonLd(locale, [{ name: tc('nav.home'), path: '/' }, { name: t('title'), path: '/scadenze' }])} />
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-3 max-w-3xl text-slate-700">{t('intro')}</p>
      <div className="mt-8">
        <ScadenzeCalculator />
      </div>
    </div>
  );
}
