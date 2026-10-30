// The notice on a saved record the running engines no longer reproduce: its documents wait for a new save. Whoever may
// make it again here reads how and has «Aggiorna con il software attuale»; whoever may not reads which colleague does
// (rbac.ts remakerOf), never a sentence about a button that is not there; on an archived project, only what changed.
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import RefreshForm from '@/components/RefreshForm';
import type { remakerOf } from '@/lib/rbac';

export default async function StaleNotice({ text, by, refresh, children }: {
  /** what changed: a lift design, a replacement's calculation, a machine room, a record in a now whole project's archive */
  text: 'design' | 'calc' | 'room' | 'archive';
  /** who makes it again (rbac.ts remakerOf) */
  by: ReturnType<typeof remakerOf>;
  /** the record the button makes again, when the user may ('self') and it can be read */
  refresh?: { kind: 'lift' | 'calc' | 'room'; id: string } | null;
  /** in place of the button, when there is none (the calculation's link to the project's form) */
  children?: ReactNode;
}) {
  const t = await getTranslations('refresh');
  const button = by === 'self' && refresh ? refresh : null;
  const how = text === 'archive' ? null : button ? t(`${text}_button`) : by === 'drawer' ? t('byDrawer') : by === 'calc' ? t('byCalc') : null;
  return (
    <div className="alert alert-warn flex flex-col items-start gap-2" role="status">
      <p className="m-0">{t(text)}{how ? ` ${how}` : ''}</p>
      {button ? <RefreshForm kind={button.kind} id={button.id} /> : children}
    </div>
  );
}
