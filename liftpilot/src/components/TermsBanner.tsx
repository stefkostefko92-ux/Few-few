import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { NOTICE_DAYS, dateText, termsDateText } from '@/lib/legal';
import type { SessionUser } from '@/lib/auth';
import { clausesDue } from '@/lib/clauses-due';
import Icon from './Icon';

// Under the top bar while the company's owner has not accepted the terms in force. Before the new version binds the
// company (src/lib/legal.ts) the owner is told when it will and works as before; once it binds, everything is
// read-only until then, and the colleagues are told who must accept. An owner who accepted the version in force with
// a bare tick (before round 48) is asked once, without blocking anything, to approve the clauses with the password.
export default async function TermsBanner({ user }: { user: SessionUser }) {
  const owner = user.role === 'OWNER';
  if (user.terms === 'ok') return (await clausesDue(user)) ? <ClausesBanner /> : null;
  // an owner who never accepted any version is on the terms' page already (src/lib/auth.ts requireUser)
  if ((owner && user.terms === 'never') || (!owner && user.terms === 'pending')) return null;
  const [t, locale] = await Promise.all([getTranslations('legal'), getLocale()]);
  const pending = user.terms === 'pending';
  const text = !owner ? t('bannerMember')
    : !pending ? t('bannerOwner', { date: termsDateText(locale) })
    : user.termsBinding ? t('bannerPending', { date: dateText(locale, user.termsBinding) }) : t('bannerNew', { days: NOTICE_DAYS });
  return (
    <div className={`billing-banner terms-banner ${pending ? 'warn' : 'bad'}`} role="status">
      <div className="inner">
        <Icon name={pending ? 'file-clock' : 'file-lock'} size={20} className="banner-icon" />
        <span className="banner-text">{text}</span>
        {owner ? <Link href="/app/terms" className="btn btn-sm">{t('bannerAction')}</Link> : null}
      </div>
    </div>
  );
}

/** The clauses of the version in force, accepted with a bare tick: to approve once with the password. */
async function ClausesBanner() {
  const t = await getTranslations('legal');
  return (
    <div className="billing-banner terms-banner warn" role="status">
      <div className="inner">
        <Icon name="file-clock" size={20} className="banner-icon" />
        <span className="banner-text">{t('bannerClauses')}</span>
        <Link href="/app/terms" className="btn btn-sm">{t('bannerClausesAction')}</Link>
      </div>
    </div>
  );
}
