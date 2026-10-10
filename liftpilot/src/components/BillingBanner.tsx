import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { can } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth';
import Icon from './Icon';

// Under the top bar on every page of the application: the trial's days, a payment being retried, the projects read-only.
// The owner gets the way to the subscription; the colleagues are told whom to ask.
export default async function BillingBanner({ user }: { user: SessionUser }) {
  if (user.access !== 'trial' && user.access !== 'grace' && user.access !== 'readonly') return null;
  const t = await getTranslations('billing');
  const tone = user.access === 'trial' ? 'info' : user.access === 'grace' ? 'warn' : 'bad';
  const text = user.access === 'trial' ? t('bannerTrial', { days: user.trialDays }) : user.access === 'grace' ? t('bannerGrace') : t('bannerReadonly');
  return (
    <div className={`billing-banner ${tone}`} role="status">
      <div className="inner">
        <Icon name={tone === 'info' ? 'info' : tone === 'warn' ? 'alert-triangle' : 'lock'} size={20} className="banner-icon" />
        <span>{text}</span>
        {can(user, 'billing:manage') ? <Link href="/app/billing" className="btn btn-sm">{t('bannerAction')}</Link> : <span className="note">{t('bannerAskOwner')}</span>}
      </div>
    </div>
  );
}
