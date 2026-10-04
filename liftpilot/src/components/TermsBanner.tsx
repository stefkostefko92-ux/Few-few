import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { termsDateText } from '@/lib/legal';
import type { SessionUser } from '@/lib/auth';

// Under the top bar while the company's owner has not accepted the terms in force: everything is read-only until then.
// The owner gets the way to the terms' page; the colleagues are told who must accept.
export default async function TermsBanner({ user }: { user: SessionUser }) {
  const owner = user.role === 'OWNER';
  // an owner who never accepted any version is on the terms' page already (src/lib/auth.ts requireUser)
  if (user.terms === 'ok' || (owner && user.terms === 'never')) return null;
  const [t, locale] = await Promise.all([getTranslations('legal'), getLocale()]);
  return (
    <div className="billing-banner bad" role="status">
      <div className="inner">
        <span>{owner ? t('bannerOwner', { date: termsDateText(locale) }) : t('bannerMember')}</span>
        {owner ? <Link href="/app/terms" className="btn btn-sm">{t('bannerAction')}</Link> : null}
      </div>
    </div>
  );
}
