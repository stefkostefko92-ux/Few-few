import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser, termsDue } from '@/lib/auth';
import { termsDateText } from '@/lib/legal';
import TermsGate from '@/components/TermsGate';

export async function generateMetadata() {
  const t = await getTranslations('legal');
  return { title: t('gateTitleNew') };
}

// The owner accepts the terms in force for the company. One who never accepted any version comes here from every page;
// after a change the company works read-only until then (src/lib/auth.ts) and the banner leads here.
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, { allowTerms: true });
  if (!termsDue(user)) redirect(`/${locale}/app`);
  return <TermsGate date={termsDateText(locale)} changed={user.terms === 'changed'} />;
}
