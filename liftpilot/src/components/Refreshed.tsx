import { getTranslations } from 'next-intl/server';
import type { Verdict } from '@prisma/client';
import { dateFormat } from '@/lib/dates';
import type { VerdictKind } from '@/lib/verdict-checks';
import VerdictPill from './VerdictPill';

interface Outcome { id: string; verdict: Verdict; failCount: number; warnCount: number }

/** On the page of a record made again with «Aggiorna con il software attuale» (?da=<the old one>): whether the result
 *  changed, with the old one beside the new when it did (each pill shows its own record's checks: `kind`). */
export default async function Refreshed({ before, now, kind, locale }: { before: Outcome & { createdAt: Date }; now: Outcome; kind: VerdictKind; locale: string }) {
  const t = await getTranslations('refresh'), date = dateFormat(locale).dateTime(before.createdAt);
  const same = before.verdict === now.verdict && before.failCount === now.failCount && before.warnCount === now.warnCount;
  return (
    // the live region is the sentence alone: the pills are controls, and the panel a pill opens is not a status to read out
    <div className={`alert ${same ? 'alert-ok' : 'alert-warn'}`}>
      <span role="status">{t(same ? 'same' : 'changed', { date })}</span>
      {same ? null : (
        <> <VerdictPill verdict={before.verdict} fails={before.failCount} warns={before.warnCount} record={{ kind, id: before.id }} /> → <VerdictPill verdict={now.verdict} fails={now.failCount} warns={now.warnCount} record={{ kind, id: now.id }} /></>
      )}
    </div>
  );
}
