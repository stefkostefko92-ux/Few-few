import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata, breadcrumbJsonLd } from '@/lib/seo';
import { resolveLocale, type LocaleParams } from '@/lib/page-params';
import { JsonLd } from '@/components/JsonLd';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: 'how' });
  return pageMetadata({ locale, path: '/come-funziona', title: t('title'), description: t('intro') });
}

export default async function HowPage(props: LocaleParams) {
  const locale = await resolveLocale(props);
  const t = await getTranslations('how');
  const tc = await getTranslations('common');
  const senderSteps = t.raw('sender.steps') as string[];
  const receiverSteps = t.raw('receiver.steps') as string[];

  return (
    <div className="container-page py-12">
      <JsonLd data={breadcrumbJsonLd(locale, [{ name: tc('nav.home'), path: '/' }, { name: t('title'), path: '/come-funziona' }])} />
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-3 max-w-3xl text-slate-700">{t('intro')}</p>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section className="card">
          <h2 className="text-xl font-semibold text-targa-700">{t('sender.title')}</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-slate-700">
            {senderSteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </section>
        <section className="card">
          <h2 className="text-xl font-semibold text-targa-700">{t('receiver.title')}</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-slate-700">
            {receiverSteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </section>
      </div>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-2xl font-bold">{t('deadlinesTitle')}</h2>
        <p className="mt-3 text-slate-700">{t('deadlinesText')}</p>
      </section>
      <section className="mt-10 max-w-3xl">
        <h2 className="text-2xl font-bold">{t('fineTitle')}</h2>
        <p className="mt-3 text-slate-700">{t('fineText')}</p>
      </section>
    </div>
  );
}
