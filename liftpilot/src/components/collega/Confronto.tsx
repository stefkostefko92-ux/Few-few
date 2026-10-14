import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { sintesi, type Classe, type Riga } from '@/lib/collega/confronto';
import { testoValore } from '@/lib/collega/formato';
import { fmt } from '@/lib/rilievi/fmt';

/** Where «usa il valore del rilievo» goes: the form of the installation's module, or its data; null — not for this role. */
export interface UsaLink {
  calc: string | null;
  progetto: string | null;
  impianto: string | null;
}

const CLASSI: readonly Classe[] = ['fatto', 'modifica', 'info'];
const TONE = { ok: 'ok', diff: 'fail', mod: 'warn', info: 'info', na: '', fuori: 'fail' } as const;

// The «Confronto» of an installation (round 44, src/lib/collega/confronto.ts): parameter | rilievo | calcolo | progetto |
// stato in three groups — what exists on site (a difference is a probable error), the expected modifications (the load,
// the persons and the speed: the acceptance test counts a changed load or speed as a modified part — the note links to
// the parts of the test, src/lib/lift/collaudo.ts PARTI 'load' and 'speed'), and what is only set
// side by side. A difference offers «Usa il valore del rilievo», which opens the right form with the survey's value in it
// (nothing is changed until that form is saved). The parameters the survey has no value for are folded under the table
// (on a phone they would bury the differences); the summary is green only once something was really compared.
export default async function Confronto({ righe, date, usa, collaudo, salvati }: {
  righe: readonly Riga[]; date: Date; usa: UsaLink; collaudo: string | null;
  /** a calculation or a design is saved (the comparison has a record to read) */
  salvati: boolean;
}) {
  const t = await getTranslations('collega.confronto'), tv = await getTranslations('collega');
  const parola = (code: string): string => (tv.has(`valore.${code}`) ? tv(`valore.${code}` as 'valore.ALTO') : code);
  const s = sintesi(righe);
  const cell = (w: Riga, v: Riga['rilievo']) => testoValore(w.param, v, parola);
  const misurate = righe.filter((w) => w.rilievo !== null), altre = righe.filter((w) => w.rilievo === null);
  const [tone, summary] = s.diff ? ['fail', t('summary', { diff: s.diff, mod: s.mod })]
    : s.confrontati === 0 ? ['', t(salvati ? 'summaryNone' : 'summaryEmpty')] : ['ok', t('summary', { diff: s.diff, mod: s.mod })];
  const tabella = (rows: readonly Riga[], caption: string) => (
    <div className="table-panel">
      <table className="data-table stack lk-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t('colParam')}</th><th scope="col">{t('colRilievo')}</th><th scope="col">{t('colCalcolo')}</th>
            <th scope="col">{t('colProgetto')}</th><th scope="col">{t('colStato')}</th>
          </tr>
        </thead>
        {CLASSI.map((c) => {
          const group = rows.filter((w) => w.classe === c);
          if (group.length === 0) return null;
          return (
            <tbody key={c} className={`lk-group lk-${c}`}>
              <tr className="lk-group-head"><th scope="rowgroup" colSpan={5}><strong>{t(`group.${c}`)}</strong> <span className="note">{t(`group.${c}Lead`)}</span></th></tr>
              {group.map((w) => {
                const href = w.usa ? usa[w.usa] : null;
                const target = href ? `${href}${href.includes('?') ? '&' : '?'}usa=${w.param}` : null;
                return (
                  <tr key={w.param} className={`lk-row lk-${w.stato}`} data-param={w.param}>
                    <th scope="row" className="row-title">{t(`param.${w.param}`)}</th>
                    <td data-label={t('colRilievo')} className="lk-v">{cell(w, w.rilievo)}</td>
                    <td data-label={t('colCalcolo')} className="lk-v">{cell(w, w.calcolo)}</td>
                    <td data-label={t('colProgetto')} className="lk-v">{cell(w, w.progetto)}</td>
                    <td data-label={t('colStato')}>
                      <div className="lk-stato">
                        <span className={`status-pill ${TONE[w.stato]}`}>{t(`stato.${w.stato}`)}</span>
                        {w.storico?.map((o) => <span key={o.data.toISOString()} className="note lk-note">{t('storico', { date: fmt.day(o.data), valore: o.valore })}</span>)}
                        {(w.param === 'Q' || w.param === 'velocita') && w.stato === 'mod' ? (
                          <span className="note lk-note">
                            {t(w.param === 'Q' ? 'collaudoLoad' : 'collaudoSpeed')}{collaudo ? <> <Link href={collaudo}>{t('collaudoLink')}</Link></> : null}
                          </span>
                        ) : null}
                        {target ? <Link className="btn btn-sm lk-usa" href={target}>{t('usa')}</Link> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
  return (
    <section className="panel lk-confronto" id="confronto" aria-labelledby="lk-confronto-title">
      <div className="panel-head">
        <div className="dash-panel-titles">
          <h2 id="lk-confronto-title">{t('title')}</h2>
          <p className="note">{t('lead', { date: fmt.day(date) })}</p>
        </div>
        <p className={tone ? `status-pill ${tone}` : 'status-pill'}>{summary}</p>
      </div>
      {s.fuori ? <p className="alert alert-bad" role="note">{t('fuori')}</p> : null}
      {misurate.length ? tabella(misurate, t('title')) : <p className="note">{t('nothingMeasured')}</p>}
      {altre.length ? (
        <details className="lk-more">
          <summary>{t('more', { n: altre.length })}</summary>
          {tabella(altre, t('more', { n: altre.length }))}
        </details>
      ) : null}
      <p className="note">{t('identityNote')}</p>
    </section>
  );
}
