import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import Icon, { type IconName } from './Icon';
import '@/app/account.css';

/** The area a page belongs to, named in the eyebrow over its title. */
export type AccountArea = 'profile' | 'company' | 'platform' | 'norms';

// The head of the account and company pages (account, team, company, subscription, audit, platform, norms, price
// list), as the workspace of the template: the area's eyebrow with the cyan dash over the title and the lead, the
// page's main action on the right.
export default async function AccountHead({ area, title, lead, chip, actions }: {
  area: AccountArea; title: ReactNode; lead?: ReactNode; chip?: ReactNode; actions?: ReactNode;
}) {
  const t = await getTranslations('account');
  return (
    <div className="page-head acct-head">
      <div className="titles">
        <p className="eyebrow">{t(`area.${area}`)}</p>
        {chip}
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

/** A panel's title row with its icon tile. */
export function PanelHead({ icon, id, children }: { icon: IconName; id?: string; children: ReactNode }) {
  return (
    <div className="panel-head acct-panel-head">
      <span className="icon-tile sm"><Icon name={icon} size={18} /></span>
      <h2 id={id}>{children}</h2>
    </div>
  );
}
