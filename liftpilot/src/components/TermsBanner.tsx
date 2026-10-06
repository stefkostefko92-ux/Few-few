import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { NOTICE_DAYS, dateText, termsDateText } from '@/lib/legal';
import type { SessionUser } from '@/lib/auth';

// Under the top bar while the company's owner has not accepted the terms in force. Before the new version binds the
// company (src/lib/legal.ts) the owner is told when it will and works as before; once it binds, everything is
// read-only until then, and the colleagues are told who must accept.
export default async function TermsBanner({ user }: { user: SessionUser }) {
  const owner = user.role === 'OWNER';
  // an owner who never accepted any version is on the terms' page already (src/lib/auth.ts requireUser)
  if (user.terms === 'ok' || (owner && user.terms === 'never') || (!owner && user.terms === 'pending')) return null;
  const [t, locale] = await Promise.all([getTranslations('legal'), getLocale()]);
  const pending = user.terms === 'pending';
  const text = !owner ? t('bannerMember')
    : !pending ? t('bannerOwner', { date: termsDateText(locale) })
    : user.termsBinding ? t('bannerPending', { date: dateText(locale, user.termsBinding) }) : t('bannerNew', { days: NOTICE_DAYS });
  return (
    <div className={`billing-banner ${pending ? 'warn' : 'bad'}`} role="status">
      <div className="inner">
        <span>{text}</span>
        {owner ? <Link href="/app/terms" className="btn btn-sm">{t('bannerAction')}</Link> : null}
      </div>
    </div>
  );
}
