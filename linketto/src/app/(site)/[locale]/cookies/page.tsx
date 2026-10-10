import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { LegalDoc } from '@/components/LegalDoc';
import type { Locale } from '@/i18n/locales';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  return pageMetadata(locale as Locale, '/cookies', {
    title: t('cookiesTitle'),
    description: tSeo('metaDescription'),
  });
}

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('legal');
  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <LegalDoc title={t('cookiesTitle')} body={t('cookiesBody')} />
      <SiteFooter locale={locale as Locale} currentPath="/cookies" />
    </>
  );
}
