import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { dateFormat } from '@/lib/dates';
import VerdictPill from '@/components/VerdictPill';
import { outdated } from '@/server/records';
import type { listProjectRts } from '@/server/rt/queries';

type Row = Awaited<ReturnType<typeof listProjectRts>>[number];

// The relazioni tecniche di modifica issued for an installation (the workspace and the installation's page): number and
// revision (the page of the RT), day and author, the checks' outcome as stored, «da aggiornare» when the running engines no
// longer reproduce it (its kept PDF stays downloadable), the PDF. A server component.
export default async function RelazioniEmesse({ rows, locale, download }: { rows: Row[]; locale: string; download: boolean }) {
  const [t, tf] = await Promise.all([getTranslations('rt'), getTranslations('refresh')]), fd = dateFormat(locale);
  if (!rows.length) return <p className="note">{t('emesse.nessuna')}</p>;
  return (
    <ul className="rec-list rt-emesse" aria-label={t('emesse.titolo')}>
      {rows.map((r) => (
        <li key={r.id} data-rt-id={r.id}>
          <Link href={`/app/relazioni/${r.id}`} className="num">{t('numero', { n: r.number })} R{r.revision}</Link>
          <span className="note">{fd.dateTime(r.createdAt)} · {r.user?.name ?? '—'}</span>
          <VerdictPill verdict={r.verdict} fails={r.failCount} warns={r.warnCount} />
          {outdated.rt(r) ? <span className="chip old">{tf('outdated')}</span> : null}
          {download && (r.pdf || !outdated.rt(r)) ? <a className="btn btn-sm" href={`/api/relazioni/${r.id}/pdf`}>{t('emesse.scarica')}</a> : null}
          <span className="rec-text">{r.summary}</span>
        </li>
      ))}
    </ul>
  );
}
