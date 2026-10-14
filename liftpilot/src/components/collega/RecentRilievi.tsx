import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { fmt } from '@/lib/rilievi/fmt';
import type { recentRilievi } from '@/server/collega/home';

type Row = Awaited<ReturnType<typeof recentRilievi>>[number];

/** The latest surveys on the home (round 44): the day, the survey (its number, matricola or address — the sheet's own
 *  title), the address, the kind of lift, and the installation it is linked to — named and opened for whoever sees the
 *  installations, otherwise only whether it is linked. The full list is /app/rilievi (the 1:1 list of rilievi). */
export default async function RecentRilievi({ rows, total, projects, canCreate }: { rows: Row[]; total: number; projects: boolean; canCreate: boolean }) {
  const [t, tr] = await Promise.all([getTranslations('collega.home'), getTranslations('rilievi')]);
  const ident = (r: Row): string => (r.numeroImpianto ? tr('scheda.titleImpianto', { n: r.numeroImpianto }) : r.matricola ? tr('scheda.titleMatricola', { n: r.matricola })
    : r.indirizzo ?? tr('scheda.title'));
  const tipo = (v: readonly string[]): string => v.map((x) => tr(`scheda.option.tipoImpianto.${x}` as 'scheda.option.tipoImpianto.ELETTRICO')).join(', ');
  return (
    <section className="panel lk-recent" aria-labelledby="lk-recent-title">
      <div className="panel-head">
        <div className="dash-panel-titles">
          <h2 id="lk-recent-title">{t('recent')}</h2>
          <p className="note">{t('recentLead', { n: total })}</p>
        </div>
        <Link className="btn btn-sm" href="/app/rilievi">{t('all')}</Link>
      </div>
      {rows.length === 0 ? (
        <div className="lk-empty">
          <p>{t('empty')}</p>
          {canCreate ? <Link className="btn btn-primary" href="/app/rilievi/nuovo">{t('new')}</Link> : null}
        </div>
      ) : (
        <div className="table-panel">
          <table className="data-table stack lk-recent-table">
            <caption className="sr-only">{t('recent')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('colData')}</th>
                <th scope="col">{t('colRilievo')}</th>
                <th scope="col">{t('colIndirizzo')}</th>
                <th scope="col">{t('colTipo')}</th>
                <th scope="col">{t('colImpianto')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono num" data-label={t('colData')}>{fmt.day(r.data)}</td>
                  <td className="row-title" data-label={t('colRilievo')}><Link href={`/app/rilievi/${r.id}`}>{ident(r)}</Link></td>
                  <td data-label={t('colIndirizzo')}>{r.indirizzo ?? '—'}</td>
                  <td data-label={t('colTipo')}>{r.tipoImpianto.length ? tipo(r.tipoImpianto) : '—'}</td>
                  <td data-label={t('colImpianto')}>
                    {!r.project ? <span className="status-pill warn">{t('notLinked')}</span>
                      : projects ? <Link href={`/app/projects/${r.project.id}`} className="lk-impianto-link">{r.project.name}</Link>
                        : <span className="status-pill ok">{t('linked')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
