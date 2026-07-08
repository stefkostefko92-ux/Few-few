import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import type { Locale } from '@/i18n/locales';

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
          {t('termsBody')}
        </p>
      </main>
      <SiteFooter locale={locale as Locale} currentPath="/terms" />
    </>
  );
}
