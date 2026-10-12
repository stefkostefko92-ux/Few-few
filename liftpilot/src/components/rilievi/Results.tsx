// The list's (or the trash's) results (rilievi _results.ejs): the empty states — nothing found for the query, the trash
// empty, no sheet yet with the way to the first —, else the table (a card per sheet on a phone) with the query's words
// marked, then the pager. In the trash a row says when the sheet was deleted and offers «Ripristina» and «Elimina
// definitivamente». Rendered on the server; the live search swaps it by asking the page again.
import { Link } from '@/i18n/routing';
import { fmt } from '@/lib/rilievi/fmt';
import type { RilieviT } from '@/lib/rilievi/t';
import type { SchedaPage } from '@/server/rilievi/queries';
import { restoreRilievoAction } from '@/server/rilievi/actions';
import ActionButton from './ActionButton';
import { Hl, Pager } from './parts';

export default function Results({ page, query, trash, canCreate, base, status, t }: {
  page: SchedaPage; query: string; trash: boolean; canCreate: boolean; base: string; status: string; t: RilieviT;
}) {
  if (page.rows.length === 0) {
    return (
      <div className="panel rv-empty">
        {query ? (
          <>
            <p><strong>{t('schede.search.none', { q: query })}</strong></p>
            <p className="note">{t('schede.search.tip')}</p>
          </>
        ) : trash ? <p><strong>{t('trash.empty')}</strong></p> : (
          <>
            <p><strong>{t('schede.empty')}</strong></p>
            {canCreate ? <Link className="btn btn-primary" href="/app/rilievi/nuovo">{t('schede.createFirst')}</Link> : null}
          </>
        )}
      </div>
    );
  }
  const tipo = (v: readonly string[]) => v.map((x) => t(`scheda.option.tipoImpianto.${x}`)).join(', ');
  const ident = (r: SchedaPage['rows'][number]) => r.numeroImpianto || r.matricola || r.indirizzo || fmt.day(r.data);
  const whenLabel = trash ? t('trash.deletedAt') : t('scheda.field.data');
  return (
    <>
      <div className="table-panel">
        <table className={trash ? 'data-table stack rv-trash' : 'data-table stack'}>
          <caption className="sr-only">{status}</caption>
          <thead>
            <tr>
              <th scope="col">{t('scheda.field.numeroImpianto')}</th>
              <th scope="col">{t('scheda.field.matricola')}</th>
              <th scope="col">{t('scheda.field.indirizzo')}</th>
              <th scope="col">{t('scheda.field.marca')}</th>
              <th scope="col">{t('scheda.field.tipoImpianto')}</th>
              <th scope="col">{whenLabel}</th>
              {trash ? <th scope="col"><span className="sr-only">{t('common.actions')}</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {page.rows.map((r) => (
              <tr key={r.id}>
                <td className="row-title ident" data-label={t('scheda.field.numeroImpianto')}>
                  <Link href={`/app/rilievi/${r.id}`} aria-label={t('schede.openRow', { id: ident(r) })}><Hl text={r.numeroImpianto} tokens={page.tokens} /></Link>
                </td>
                <td className="ident" data-label={t('scheda.field.matricola')}><Hl text={r.matricola} tokens={page.tokens} /></td>
                <td data-label={t('scheda.field.indirizzo')}><Hl text={r.indirizzo} tokens={page.tokens} /></td>
                <td data-label={t('scheda.field.marca')}><Hl text={r.marca} tokens={page.tokens} /></td>
                <td data-label={t('scheda.field.tipoImpianto')}>{tipo(r.tipoImpianto) || '—'}</td>
                <td className="date" data-label={whenLabel}>{trash ? fmt.dateTime(r.deletedAt) : fmt.day(r.data)}</td>
                {trash ? (
                  <td className="acts" data-label={t('common.actions')}>
                    <div className="rv-acts">
                      <ActionButton action={restoreRilievoAction} id={r.id} label={t('trash.restore')} icon="refresh-cw" variant="btn btn-sm" />
                      <Link className="btn btn-sm btn-danger" href={`/app/rilievi/cestino/${r.id}/elimina`}>{t('trash.purge')}</Link>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager base={base} q={query} page={page.page} pages={page.pages} t={t} />
    </>
  );
}
