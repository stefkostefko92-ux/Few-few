import { getTranslations } from 'next-intl/server';
import { LxPage } from '@/components/landing/LxPage';
import { LegalDoc } from '@/components/LegalDoc';
import type { Locale } from '@/i18n/locales';
import { REFERRAL_MIN_PAYOUT_CENTS, REFERRAL_PERCENT } from '@/lib/referral';

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('legal');
  return (
    <>
      <LxPage locale={locale as Locale} currentPath="/terms">
      {/* Програмата за покани (Т2) чете процента и прага от кода — текстът не може да се размине с него. */}
      <LegalDoc
        title={t('termsTitle')}
        body={t('termsBody', {
          percent: REFERRAL_PERCENT,
          minPayout: REFERRAL_MIN_PAYOUT_CENTS / 100,
        })}
      />
      </LxPage>
    </>
  );
}
