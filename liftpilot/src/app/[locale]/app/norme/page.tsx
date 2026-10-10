import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { PROFILO, VOCI, type Stato } from '@/calc/norme';
import { VOCI_VANO } from '@/shaft';
import { VOCI_IMPIANTO } from '@/lib/lift/norme';
import { VOCI_SIM } from '@/sim/norme';
import AccountHead, { PanelHead } from '@/components/AccountHead';
import Icon from '@/components/Icon';

export async function generateMetadata() {
  const t = await getTranslations('norme');
  return { title: t('title') };
}

const STATUS_CLASS: Record<Stato, string> = { confermato: 'ok', da_verificare: 'warn', stima: 'info', derivazione: 'info', scelta: 'info', prassi: 'info' };

interface Entry {
  id: string;
  titolo: string;
  valore: string;
  riferimento: string;
  fonte: string;
  stato: Stato;
  costanti?: readonly string[];
  nota?: string;
}

/** The registries in the order of the work — the machine, the shaft and its room, the values of the one form, the
 *  simulation — with the name of their constants in the code. */
const PARTS: ReadonlyArray<{ key: 'machine' | 'shaft' | 'lift' | 'sim'; k: string; voci: readonly Entry[] }> = [
  { key: 'machine', k: 'K', voci: VOCI },
  { key: 'shaft', k: 'KV', voci: VOCI_VANO },
  { key: 'lift', k: 'KL', voci: VOCI_IMPIANTO },
  { key: 'sim', k: 'KS', voci: VOCI_SIM },
];

// The registries of the Italian profile as the engines use them: every value with its clause, source and status.
export default async function NormePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCapability(locale, 'projects:view');
  const t = await getTranslations('norme');
  const counts = PARTS.flatMap((p) => p.voci).reduce<Partial<Record<Stato, number>>>((acc, v) => ({ ...acc, [v.stato]: (acc[v.stato] ?? 0) + 1 }), {});
  return (
    <main className="page">
      <AccountHead icon="book-open" title={t('title')} lead={t('lead')} chip={<span className="chip">{t('profile', { id: PROFILO.id })}</span>}
        actions={<a className="btn btn-sm" href="/api/lista-verifica"><Icon name="file-spreadsheet" size={18} />{t('download')}</a>} />
      <section className="panel" aria-labelledby="profile-h">
        <PanelHead icon="shield-check" id="profile-h">{PROFILO.titolo}</PanelHead>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {PROFILO.documenti.map((d) => <li key={d.sigla}><b>{d.sigla}</b> — <span className="note">{d.ambito}</span></li>)}
        </ul>
      </section>
      <ul className="kpi-grid norme-kpis">
        {(Object.keys(STATUS_CLASS) as Stato[]).filter((s) => counts[s]).map((s) => (
          <li key={s} className={`kpi ${STATUS_CLASS[s]}`}><span className="kpi-value num">{counts[s]}</span><span className="kpi-label">{t(`stato_${s}`)}</span></li>
        ))}
      </ul>
      {PARTS.map((p) => (
        <section key={p.key} className="flex flex-col gap-3" aria-labelledby={`part-${p.key}`}>
          <h2 id={`part-${p.key}`}>{t(`part_${p.key}`)} <span className="note">· {p.voci.length}</span></h2>
          <div className="table-panel">
            <table className="data-table stack">
              <thead><tr><th>{t('col_item')}</th><th>{t('col_value')}</th><th>{t('col_ref')}</th><th>{t('col_status')}</th></tr></thead>
              <tbody>
                {p.voci.map((v) => (
                  <tr key={v.id}>
                    <td className="row-title"><b>{v.titolo}</b><div className="note mono">{v.id}</div>{v.nota ? <div className="note">{v.nota}</div> : null}</td>
                    <td data-label={t('col_value')}><div>{v.valore}{v.costanti?.length ? <div className="note mono">{p.k}.{v.costanti.join(`, ${p.k}.`)}</div> : null}</div></td>
                    <td data-label={t('col_ref')}><div>{v.riferimento}<div className="note">{v.fonte}</div></div></td>
                    <td data-label={t('col_status')}><span className={`status-pill ${STATUS_CLASS[v.stato]}`}>{t(`stato_${v.stato}`)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
