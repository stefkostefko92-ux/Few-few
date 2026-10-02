import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { requireUser, termsDue } from '@/lib/auth';
import { TERMS_VERSION } from '@/lib/legal';
import TermsGate from '@/components/TermsGate';

export async function generateMetadata() {
  const t = await getTranslations('legal');
  return { title: t('gateTitle') };
}

// The owner accepts the terms in force for the company: every page of the application sends here while it is due.
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, { allowTerms: true });
  if (!termsDue(user)) redirect(`/${locale}/app`);
  const date = new Intl.DateTimeFormat(INTL_LOCALE[isLocale(locale) ? locale : 'it'], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${TERMS_VERSION}T00:00:00Z`));
  return <TermsGate date={date} />;
}
