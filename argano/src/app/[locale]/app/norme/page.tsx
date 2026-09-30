import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { PROFILO, VOCI, type Stato } from '@/calc/norme';

export async function generateMetadata() {
  const t = await getTranslations('norme');
  return { title: t('title') };
}

const STATUS_CLASS: Record<Stato, string> = { confermato: 'ok', da_verificare: 'warn', stima: 'info', derivazione: 'info', scelta: 'info', prassi: 'info' };

// The registry of the Italian profile as the engine uses it: every value with its clause, source and status.
export default async function NormePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCapability(locale, 'projects:view');
  const t = await getTranslations('norme');
  const counts = VOCI.reduce<Partial<Record<Stato, number>>>((acc, v) => ({ ...acc, [v.stato]: (acc[v.stato] ?? 0) + 1 }), {});
  return (
    <main className="page">
      <div className="page-head">
        <div className="titles">
          <span className="chip">{t('profile', { id: PROFILO.id })}</span>
          <h1>{t('title')}</h1>
          <p className="lead">{t('lead')}</p>
        </div>
      </div>
      <section className="panel">
        <h2>{PROFILO.titolo}</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {PROFILO.documenti.map((d) => <li key={d.sigla}><b>{d.sigla}</b> — <span className="note">{d.ambito}</span></li>)}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(STATUS_CLASS) as Stato[]).filter((s) => counts[s]).map((s) => (
            <span key={s} className={`status-pill ${STATUS_CLASS[s]}`}>{t(`stato_${s}`)} · {counts[s]}</span>
          ))}
          <a className="btn btn-sm" href="/api/lista-verifica">{t('download')}</a>
        </div>
        <div className="table-panel">
          <table className="data-table stack">
            <thead><tr><th>{t('col_item')}</th><th>{t('col_value')}</th><th>{t('col_ref')}</th><th>{t('col_status')}</th></tr></thead>
            <tbody>
              {VOCI.map((v) => (
                <tr key={v.id}>
                  <td className="row-title"><b>{v.titolo}</b><div className="note mono">{v.id}</div>{v.nota ? <div className="note">{v.nota}</div> : null}</td>
                  <td data-label={t('col_value')}><div>{v.valore}{v.costanti?.length ? <div className="note mono">K.{v.costanti.join(', K.')}</div> : null}</div></td>
                  <td data-label={t('col_ref')}><div>{v.riferimento}<div className="note">{v.fonte}</div></div></td>
                  <td data-label={t('col_status')}><span className={`status-pill ${STATUS_CLASS[v.stato]}`}>{t(`stato_${v.stato}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
