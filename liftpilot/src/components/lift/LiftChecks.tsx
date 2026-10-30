'use client';

// Every check of the installation: the machine's (traction, ropes, drive, brake, rescue) and the shaft's (plan, section,
// machine room and the beams under the machine), with value, limit and result. Under UNI 10411 a check of a part that
// stays as it is shows "existing" with what the calculation gives beside it, and stays out of the acceptance test's
// result. Round 53: the problems first — the checks not met and those with «Attenzione» the test counts —, the others
// closed under their count (open in «Esperto»); where the simulation can replay a check, a button runs it: here
// (`onSimulate`, the Simulazione's page) or on the Simulazione's page (`simulaHref`); `solo="simulabili"` lists only
// those (the Simulazione's page). Round 54: a check to look at has «Rimedi» (`rimedi`: the screen holding the design) —
// the values that make it pass, found by trying them on the whole design, under its row (RimediVerifica).
import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { ReactNode } from 'react';
import SectionTitle from '@/components/project/SectionTitle';
import type { Check, CheckStatus } from '@/calc/types';
import { NORMA_BREVE, NORMA_SIGLA, ambitoOf, problemiCollaudo, type LiftDerived } from '@/lib/lift';
import { verificaKey } from '@/lib/lift/calata';
import type { Texts } from '@/lib/present/texts';
import { isUpperLimit, mergeChecks, shownValue, type ShaftCheck } from '@/shaft';
import { useModalita } from '../shell/Modalita';
import { scenarioForCheck } from './scenarios';
import type { SimRequest } from './LiftSimulator';
import RimediVerifica, { type FonteRimedi } from '../rimedi/RimediVerifica';

interface Props {
  derived: LiftDerived;
  X: Texts;
  fmt(x: number, dec?: number): string;
  /** replays a check in the simulator on this page */
  onSimulate?(req: SimRequest): void;
  /** the Simulazione's page that replays a check */
  simulaHref?(id: string): string;
  /** opens that page itself (the Progetto keeps its draft first); absent: the link */
  apri?(href: string): void;
  /** only the checks the simulation replays */
  solo?: 'simulabili';
  /** the remedies of a check to look at (the screen holding the design); absent: none */
  rimedi?: FonteRimedi<unknown> | null;
}

type Id = Check['id'] | ShaftCheck['id'];
interface Row { id: Id; status: CheckStatus; existing: boolean; cells: ReactNode }

export default function LiftChecks({ derived, X, fmt, onSimulate, simulaHref, apri, solo, rimedi = null }: Props) {
  const t = useTranslations('lift'), ts = useTranslations('shaft'), tr = useTranslations('rimedi'), esperto = useModalita()?.modalita === 'esperto';
  const [aperto, setAperto] = useState<string | null>(null);
  const res = derived.analysis.res, L = derived.layout;
  const replay = (id: Id): SimRequest | null => scenarioForCheck(id, res, derived.sim);
  const simulate = (id: Id) => {
    if (!replay(id)) return null;
    if (onSimulate) return <button type="button" className="btn btn-sm" onClick={() => { const req = replay(id); if (req) onSimulate(req); }}>▶ {t('simulate')}</button>;
    const href = simulaHref?.(id);
    return href ? <Link className="btn btn-sm" href={href} onClick={apri ? (e) => { e.preventDefault(); apri(href); } : undefined}>▶ {t('simulate')}</Link> : null;
  };
  // as in the report: the value and the limit with their unit, the limit with its sense
  const N = derived.analysis.ctx.N;
  const C = derived.collaudo, existing = (id: Id): boolean => ambitoOf(C, id) === 'existing';
  const result = (id: Id, status: CheckStatus, text: string) => (existing(id)
    ? <span className="ambito" title={t('ambito_note', { norma: NORMA_SIGLA[C.norma], status: text })}><span className="status-pill existing">{t('ambito_existing')}</span><span className={`ambito-calc ${status}`}>{text}</span></span>
    : <span className={`status-pill ${status}`}>{text}</span>);
  const rows: Row[] = [
    ...res.checks.map((c) => ({
      id: c.id, status: c.status, existing: existing(c.id), cells: (
        <>
          <th scope="row">{X.checkText(c)}</th>
          <td className="num" data-label={t('col_value')}>{X.checkValue(c, N)}</td>
          <td className="num note" data-label={t('col_limit')}>{X.checkLimit(c, N)}</td>
          <td data-label={t('col_result')}>{result(c.id, c.status, X.st(c.status))}</td>
        </>
      ),
    })),
    ...mergeChecks(L.checks, derived.supportChecks).map((c) => {
      const unit = c.unit ? ` ${c.unit}` : '';
      return {
        id: c.id, status: c.status, existing: existing(c.id), cells: (
          <>
            <th scope="row">{ts(verificaKey(c.id, derived.values))}</th>
            <td className="num" data-label={t('col_value')}>{c.value === null ? '—' : `${shownValue(c, fmt)}${unit}`}</td>
            <td className="num note" data-label={t('col_limit')}>{c.limit === null ? '' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)}${unit}`}</td>
            <td data-label={t('col_result')}>{result(c.id, c.status, ts(`st_${c.status}`))}</td>
          </>
        ),
      };
    }),
  ].filter((r) => solo !== 'simulabili' || replay(r.id) !== null);
  // a check's name as its row reads it, for what a remedy puts right or breaks
  const nome = (id: string): string => {
    const c = res.checks.find((x) => x.id === id);
    return c ? X.checkLabel(c.id) : ts(verificaKey(id, derived.values));
  };
  // a problem: what the test's verdict counts against the lift (collaudo.ts problemiCollaudo)
  const counted = new Set(problemiCollaudo(C, rows).map((r) => r.id)), problems = rows.filter((r) => counted.has(r.id));
  const others = rows.filter((r) => !problems.includes(r));
  // the problems' rows with «Rimedi» (one open at a time, under its row)
  const table = (list: readonly Row[], label: string, conRimedi = false) => (
    <div className="table-panel">
      <table className="data-table stack" aria-label={label}>
        <thead><tr><th>{t('col_check')}</th><th className="num">{t('col_value')}</th><th className="num">{t('col_limit')}</th><th>{t('col_result')}</th><th /></tr></thead>
        <tbody>
          {list.map((r) => (
            <Fragment key={r.id}>
              <tr className={r.existing ? 'existing' : undefined} data-check={r.id}>
                {r.cells}
                <td>
                  <div className="check-acts">
                    {simulate(r.id)}
                    {conRimedi && rimedi ? (
                      <button type="button" className="btn btn-sm" aria-expanded={aperto === r.id} aria-controls={`rimedi-${r.id}`} onClick={() => setAperto(aperto === r.id ? null : r.id)}>{tr('apri')}</button>
                    ) : null}
                  </div>
                </td>
              </tr>
              {conRimedi && rimedi && aperto === r.id ? (
                <tr className="rimedi-row" id={`rimedi-${r.id}`}><td colSpan={5}><RimediVerifica id={r.id} fonte={rimedi} nome={nome} fmt={fmt} onApplied={() => setAperto(null)} /></td></tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section id="checks" className="lift-checks">
      <SectionTitle icon="list-checks" eyebrow={NORMA_BREVE[C.norma]}>{t(solo === 'simulabili' ? 'checks_sim_title' : 'checks_title')}</SectionTitle>
      {problems.length ? table(problems, t('checks_problems', { n: problems.length }), solo !== 'simulabili') : <p className="note checks-none">{t(solo === 'simulabili' ? 'checks_sim_none' : 'checks_none')}</p>}
      {others.length ? (
        <details className="checks-others" open={esperto || undefined}>
          <summary>{t('checks_others', { n: others.length })}</summary>
          {table(others, t('checks_others', { n: others.length }))}
        </details>
      ) : null}
    </section>
  );
}
