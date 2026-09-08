import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata, breadcrumbJsonLd, CONTACT_EMAIL } from '@/lib/seo';
import { resolveLocale, type LocaleParams } from '@/lib/page-params';
import { JsonLd } from '@/components/JsonLd';
import { ContactForm } from '@/components/ContactForm';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: 'contact' });
  return pageMetadata({ locale, path: '/contatti', title: t('title'), description: t('intro') });
}

export default async function ContactPage(props: LocaleParams) {
  const locale = await resolveLocale(props);
  const t = await getTranslations('contact');
  const tc = await getTranslations('common');
  return (
    <div className="container-page py-12">
      <JsonLd data={breadcrumbJsonLd(locale, [{ name: tc('nav.home'), path: '/' }, { name: t('title'), path: '/contatti' }])} />
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-3 max-w-3xl text-slate-700">{t('intro')}</p>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <ContactForm />
        <section className="card">
          <h2 className="text-lg font-semibold">{t('dsaTitle')}</h2>
          <p className="mt-2 text-slate-700">{t('dsaText', { email: CONTACT_EMAIL })}</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="mt-4 inline-block font-semibold text-targa-700">{CONTACT_EMAIL}</a>
        </section>
      </div>
    </div>
  );
}
