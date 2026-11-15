import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
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
      <SiteHeader locale={locale as Locale} />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('termsTitle')}</h1>
        <p className="mt-6 whitespace-pre-line leading-relaxed text-slate-700">
          {/* Програмата за покани (Т2) чете процента и прага от кода — текстът не може да се размине с него. */}
          {t('termsBody', {
            percent: REFERRAL_PERCENT,
            minPayout: REFERRAL_MIN_PAYOUT_CENTS / 100,
          })}
        </p>
      </main>
      <SiteFooter locale={locale as Locale} currentPath="/terms" />
    </>
  );
}
