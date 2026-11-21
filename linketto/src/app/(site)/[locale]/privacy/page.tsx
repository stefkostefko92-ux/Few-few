import { getTranslations } from 'next-intl/server';
import { LxPage } from '@/components/landing/LxPage';
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
      <LxPage locale={locale as Locale} currentPath="/privacy">
      <LegalDoc title={t('privacyTitle')} body={t('privacyBody')} />
      </LxPage>
    </>
  );
}
