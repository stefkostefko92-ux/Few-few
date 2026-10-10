import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import '@/app/account.css';

// The head of the account and company pages (account, team, company, subscription, audit, platform, norms, price
// list): the section's painted icon in its tile beside the title and the lead, as the workspace of the template.
export default function AccountHead({ icon, title, lead, chip, actions }: {
  icon: IconName; title: ReactNode; lead?: ReactNode; chip?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="page-head acct-head">
      <span className="icon-tile lg"><Icon name={icon} size={26} priority /></span>
      <div className="titles">
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
