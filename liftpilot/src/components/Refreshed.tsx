import { getTranslations } from 'next-intl/server';
import type { Verdict } from '@prisma/client';
import { dateFormat } from '@/lib/dates';
import VerdictPill from './VerdictPill';

interface Outcome { verdict: Verdict; failCount: number; warnCount: number }

/** On the page of a record made again with «Aggiorna con il software attuale» (?da=<the old one>): whether the result
 *  changed, with the old one beside the new when it did. */
export default async function Refreshed({ before, now, locale }: { before: Outcome & { createdAt: Date }; now: Outcome; locale: string }) {
  const t = await getTranslations('refresh'), date = dateFormat(locale).dateTime(before.createdAt);
  const same = before.verdict === now.verdict && before.failCount === now.failCount && before.warnCount === now.warnCount;
  return (
    <p className={`alert ${same ? 'alert-ok' : 'alert-warn'}`} role="status">
      {t(same ? 'same' : 'changed', { date })}
      {same ? null : (
        <> <VerdictPill verdict={before.verdict} fails={before.failCount} warns={before.warnCount} /> → <VerdictPill verdict={now.verdict} fails={now.failCount} warns={now.warnCount} /></>
      )}
    </p>
  );
}
