import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LxPage } from '@/components/landing/LxPage';
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
  return pageMetadata(locale as Locale, '/privacy', {
    title: t('privacyTitle'),
    description: tSeo('privacyDescription'),
    keywords: tSeo('keywords').split(', '),
  });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('legal');
  return (
    <>
      <LxPage locale={locale as Locale} currentPath="/privacy">
      <LegalDoc title={t('privacyTitle')} body={t('privacyBody')} />
      </LxPage>
    </>
  );
}
