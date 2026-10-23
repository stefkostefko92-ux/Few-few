import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

// The head of a Rilievi page, as the workspace's other heads: the area (the sidebar's «Rilievi») over the title, an
// optional way back above it (rilievi: «Tutte le schede»), the lead under it, the page's actions on the right.
export default async function RilieviHead({ title, lead, back, actions }: {
  title: ReactNode; lead?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode;
}) {
  const t = await getTranslations('nav');
  return (
    <div className="page-head rv-head">
      <div className="titles">
        {back ? <Link className="rv-back" href={back.href}>{back.label}</Link> : <p className="eyebrow">{t('rilievi')}</p>}
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
