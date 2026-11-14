import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { LegalDoc } from '@/components/LegalDoc';
import type { Locale } from '@/i18n/locales';

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('legal');
  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <LegalDoc title={t('privacyTitle')} body={t('privacyBody')} />
      <SiteFooter locale={locale as Locale} currentPath="/privacy" />
    </>
  );
}
