// The machine to order among SICOR's and Montanari's (src/lib/lift/advice.ts) as the screens show it: the first of each
// maker side by side with what it is verified with and where its data come from, why the first comes first, every model
// verified in a table, and — direct pull finding no machine — the same with the diverting pulley in the machine room.
// No state and no directive: the live panel (MachineAdvice) verifies the models in the browser; the saved pages render
// it on the server with the advice of the record and no `onUse`.
import { useTranslations } from 'next-intl';
import SectionTitle from '@/components/project/SectionTitle';
import type { MachineAdvice, MachineCandidate } from '@/lib/lift/advice';
import { dvText, excludedText, machineName, whyValues } from '@/lib/present/advice';

export interface AdviceViewProps {
  /** null: not verified yet */
  advice: MachineAdvice | null;
  /** direct pull finding no machine: the advice with the diverting pulley, and the sheave direct pull needs [mm] */
  alt?: { advice: MachineAdvice; sheave: number } | null;
  /** the models verified so far while the advice is worked out again */
  running?: { done: number; total: number } | null;
  fmt(x: number, dec?: number): string;
  /** the machine the form, the calculator or the saved record holds */
  inUse(c: MachineCandidate): boolean;
  /** absent: read only (a saved record) */
  onUse?(c: MachineCandidate): void;
  where: 'design' | 'calc';
}

const key = (c: MachineCandidate): string => `${c.brand} ${c.model} ${c.I.layout}`;

export default function AdviceView({ advice, alt = null, running = null, fmt, inUse, onUse, where }: AdviceViewProps) {
  const t = useTranslations('advice');
  const dText = (d: number): string => fmt(d, Number.isInteger(d) ? 0 : 1);
  const status = (c: MachineCandidate): 'ok' | 'warn' | 'fail' => (c.fails ? 'fail' : c.warns ? 'warn' : 'ok');
  const result = (c: MachineCandidate): string => (c.fails ? t('res_fail', { n: c.fails }) : c.warns ? t('res_warn', { n: c.warns }) : t('res_ok'));
  const sources = (c: MachineCandidate): string => c.sources.map((s) => t(`src_${s}`)).join(' + ');
  // the whole machine, marked when the parts its catalogue leaves out are estimated
  const massText = (c: MachineCandidate): string => (c.massWhole === null ? '—' : `${c.massEstimated ? '≈ ' : ''}${fmt(c.massWhole, 0)} kg${c.massEstimated ? ` ${t('mass_est')}` : ''}`);
  const bed = (c: MachineCandidate): string => (c.bedplate ? t('bed_maker', { code: c.bedplate.code, kg: fmt(c.bedplate.mass, 0) }) : t('bed_ours'));
  const held = (): string => (onUse ? t('in_use') : t(where === 'design' ? 'recorded_design' : 'recorded_calc'));
  const reason = (A: MachineAdvice): string => (A.best[0] && A.why ? t(`why_${A.why}`, whyValues(A.best[0], A.best[1], fmt)) : '');
  const button = (c: MachineCandidate, label: string, primary: boolean) => {
    if (!onUse) return null;
    // an advice being worked out again is for the inputs as they were: its values are not taken
    const used = inUse(c);
    return <button type="button" className={primary ? 'btn btn-primary' : 'btn'} onClick={() => onUse(c)} disabled={used || running !== null}>{used ? t('using') : label}</button>;
  };

  const card = (c: MachineCandidate, first: boolean, use: string) => (
    <article key={key(c)} className={`advice-card${first ? ' best' : ''}`} aria-label={machineName(c)}>
      <header>
        <h3>{machineName(c)}</h3>
        {first ? <span className="badge ok">{t('best')}</span> : null}
        {inUse(c) ? <span className="badge">{held()}</span> : null}
      </header>
      <dl>
        <div><dt>{t('f_ratio')}</dt><dd className="num">{c.ratio} · v {dvText(c.dv, fmt)} %</dd></div>
        <div><dt>{t('f_sheave')}</dt><dd className="num">Ø {fmt(c.N.D, 0)} · {c.N.n} × Ø{dText(c.N.d)}</dd></div>
        <div><dt>{t('f_motor')}</dt><dd className="num">{fmt(c.N.Pn, 1)} kW{c.kWmax !== null ? ` · ${t('max', { kw: fmt(c.kWmax, 1) })}` : ''}</dd></div>
        <div><dt>{t('f_static')}</dt><dd className="num">{fmt(c.staticKg, 0)} kg · {t('test', { kg: fmt(c.testKg, 0) })}</dd></div>
        <div><dt>{t('f_mass')}</dt><dd className="num">{massText(c)}</dd></div>
        {c.I.layout === 'topDefl' ? <div><dt>{t('f_bedplate')}</dt><dd>{bed(c)}</dd></div> : null}
        <div><dt>{t('f_source')}</dt><dd title={c.src}>{sources(c)}</dd></div>
        <div><dt>{t('f_drawn')}</dt><dd>{t(c.drawn ? 'drawn_yes' : 'drawn_no')}</dd></div>
        <div className="wide"><dt>{t('f_result')}</dt><dd className={`res ${status(c)}`}>{result(c)}</dd></div>
      </dl>
      {button(c, use, first)}
    </article>
  );

  const all = (A: MachineAdvice) => {
    const defl = A.candidates.some((c) => c.I.layout === 'topDefl'), left = excludedText(A);
    // short headings over the columns (the full label in the title), the full label beside each value on a phone; the
    // outcome under the machine's name on a wider screen, on its own line on a phone
    const th = (short: string, full: string, num = false) => <th scope="col" title={full} className={num ? 'num' : undefined}>{short}</th>;
    return (
      <details className="advice-all">
        <summary>{t('table', { n: A.candidates.length, total: A.models.length })}</summary>
        <div className="table-scroll">
          <table className="data-table stack">
            <thead>
              <tr>
                <th scope="col">{t('th_machine')}</th>
                {th(t('th_ratio'), t('f_ratio'))}
                {th(t('f_sheave'), t('f_sheave'))}
                {th(t('th_static'), t('f_static'), true)}
                {th(t('f_mass'), t('f_mass'), true)}
                {defl ? th(t('th_bedplate'), t('f_bedplate')) : null}
                {th(t('th_source'), t('f_source'))}
                <th scope="col" className="res-cell">{t('th_result')}</th>
                {onUse ? <th scope="col"><span className="sr-only">{t('use_short')}</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {A.candidates.map((c, k) => (
                <tr key={key(c)}>
                  <td className="row-title">
                    <span className="rank">{k + 1}</span> <b>{machineName(c)}</b>{inUse(c) ? <> <span className="badge">{held()}</span></> : null}
                    <span className={`res res-line ${status(c)}`}>{result(c)}</span>
                  </td>
                  <td className="spec" data-label={t('f_ratio')}>{c.ratio} · {dvText(c.dv, fmt)} %</td>
                  <td className="spec" data-label={t('f_sheave')}>Ø {fmt(c.N.D, 0)} · {c.N.n} × Ø{dText(c.N.d)}</td>
                  <td className="spec num" data-label={t('f_static')}>{fmt(c.staticKg, 0)} kg</td>
                  <td className="spec num" data-label={t('f_mass')}>{massText(c)}</td>
                  {defl ? <td data-label={t('f_bedplate')}>{c.I.layout === 'topDefl' ? (c.bedplate ? c.bedplate.code : t('bed_ours')) : '—'}</td> : null}
                  <td data-label={t('f_source')}><abbr title={`${sources(c)} — ${c.src}`}>{c.sources.join(' + ')}</abbr></td>
                  <td data-label={t('f_result')} className={`res res-cell ${status(c)}`}>{result(c)}</td>
                  {onUse ? <td className="use">{button(c, t('use_short'), false)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {left ? <p className="note">{t('excluded', { list: left })}</p> : null}
      </details>
    );
  };

  const deflector = advice && !advice.candidates.length && alt?.advice.best.length ? alt : null;
  return (
    <section className={`panel advice${advice && running ? ' stale' : ''}`} aria-labelledby="advice-title" aria-busy={running ? true : undefined}>
      <div className="advice-head">
        <SectionTitle id="advice-title" icon="motor">{t('title')}</SectionTitle>
        <p className="note">{t('lead')}</p>
        {running ? (
          <p className="advice-run" role="status">
            <span>{t(advice ? 'updating' : 'pending', running)}</span>
            <progress value={running.done} max={running.total} />
          </p>
        ) : null}
      </div>
      {advice ? (
        <div className="advice-body">
          {advice.wall ? <p className="note">{t('wall')}</p> : null}
          {advice.best.length ? <div className="advice-grid">{advice.best.map((c, k) => card(c, k === 0, t('use')))}</div> : <p className="note">{t('none_all')}</p>}
          {advice.best.length ? <p className="advice-why">{reason(advice)}</p> : null}
          {advice.candidates.length ? advice.none.map((brand) => <p key={brand} className="note">{t('none_brand', { brand })}</p>) : null}
          {deflector ? (
            <div className="advice-alt">
              <h3>{t('alt_title')}</h3>
              <p className="note">{t('alt_lead', { d: fmt(deflector.sheave, 0) })}</p>
              <div className="advice-grid">{deflector.advice.best.map((c, k) => card(c, k === 0, t('use_defl')))}</div>
              <p className="advice-why">{reason(deflector.advice)}</p>
              {all(deflector.advice)}
            </div>
          ) : null}
          {advice.candidates.length ? all(advice) : null}
        </div>
      ) : null}
      <p className="note">{t('data_note')} {t(onUse ? (where === 'design' ? 'note_design' : 'note_calc') : 'note_saved')}</p>
    </section>
  );
}
