import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser, termsDue } from '@/lib/auth';
import { clausesDue } from '@/lib/clauses-due';
import { dateText, termsDateText } from '@/lib/legal';
import ClausesApproval from '@/components/ClausesApproval';
import TermsGate from '@/components/TermsGate';

export async function generateMetadata() {
  const t = await getTranslations('legal');
  return { title: t('gateTitleNew') };
}

// The owner accepts the terms in force for the company. One who never accepted any version comes here from every page;
// one who accepted an older version comes from the banner — before the new one binds the company (src/lib/legal.ts)
// or after, when the company is read-only until then (src/lib/auth.ts). One who accepted the version in force with a
// bare tick (before round 48) comes from the banner too, to approve the clauses alone with the password
// (src/lib/clauses-due.ts).
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, { allowTerms: true });
  if (user.terms === 'ok' && (await clausesDue(user))) return <ClausesApproval />;
  if (!termsDue(user) || user.terms === 'ok') redirect(`/${locale}/app`);
  return <TermsGate date={termsDateText(locale)} state={user.terms}
    binding={user.termsBinding ? dateText(locale, user.termsBinding) : null} />;
}
