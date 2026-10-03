'use client';

// Every check of the installation in one list: the machine's (traction, ropes, drive, brake, rescue) and the
// shaft's (plan, section, machine room and the beams under the machine), with value, limit and result; where the
// simulation can replay a check, a button runs it in 3D. Under UNI 10411 a check of a part that stays as it is shows
// "existing" with what the calculation gives beside it, and stays out of the acceptance test's result.
import { useTranslations } from 'next-intl';
import type { Check, CheckStatus } from '@/calc/types';
import { NORMA_SIGLA, ambitoOf, type LiftDerived } from '@/lib/lift';
import type { Texts } from '@/lib/present/texts';
import { isUpperLimit, shownValue, type ShaftCheck } from '@/shaft';
import { scenarioForCheck } from './scenarios';
import type { SimRequest } from './LiftSimulator';

interface Props {
  derived: LiftDerived;
  X: Texts;
  fmt(x: number, dec?: number): string;
  onSimulate?(req: SimRequest): void;
}

export default function LiftChecks({ derived, X, fmt, onSimulate }: Props) {
  const t = useTranslations('lift'), ts = useTranslations('shaft');
  const res = derived.analysis.res, L = derived.layout;
  const simulate = (id: Check['id'] | ShaftCheck['id']) => {
    const req = onSimulate ? scenarioForCheck(id, res, derived.sim) : null;
    return req && onSimulate ? <button type="button" className="btn btn-sm" onClick={() => onSimulate(req)}>▶ {t('simulate')}</button> : null;
  };
  // as in the report: the value and the limit with their unit, the limit with its sense
  const N = derived.analysis.ctx.N;
  const C = derived.collaudo, existing = (id: Check['id'] | ShaftCheck['id']): boolean => ambitoOf(C, id) === 'existing';
  const result = (id: Check['id'] | ShaftCheck['id'], status: CheckStatus, text: string) => (existing(id)
    ? <span className="ambito" title={t('ambito_note', { norma: NORMA_SIGLA[C.norma], status: text })}><span className="status-pill existing">{t('ambito_existing')}</span><span className={`ambito-calc ${status}`}>{text}</span></span>
    : <span className={`status-pill ${status}`}>{text}</span>);
  return (
    <section className="lift-checks">
      <h2>{t('checks_title')}</h2>
      <div className="table-panel">
        <table className="data-table stack">
          <thead><tr><th>{t('col_check')}</th><th className="num">{t('col_value')}</th><th className="num">{t('col_limit')}</th><th>{t('col_result')}</th><th /></tr></thead>
          <tbody>
            {res.checks.map((c) => (
              <tr key={c.id} className={existing(c.id) ? 'existing' : undefined}>
                <th scope="row">{X.checkText(c)}</th>
                <td className="num" data-label={t('col_value')}>{X.checkValue(c, N)}</td>
                <td className="num note" data-label={t('col_limit')}>{X.checkLimit(c, N)}</td>
                <td data-label={t('col_result')}>{result(c.id, c.status, X.st(c.status))}</td>
                <td>{simulate(c.id)}</td>
              </tr>
            ))}
            {[...L.checks, ...derived.supportChecks].map((c) => {
              const unit = c.unit ? ` ${c.unit}` : '';
              return (
                <tr key={c.id} className={existing(c.id) ? 'existing' : undefined}>
                  <th scope="row">{ts(`c_${c.id}`)}</th>
                  <td className="num" data-label={t('col_value')}>{c.value === null ? '—' : `${shownValue(c, fmt)}${unit}`}</td>
                  <td className="num note" data-label={t('col_limit')}>{c.limit === null ? '' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)}${unit}`}</td>
                  <td data-label={t('col_result')}>{result(c.id, c.status, ts(`st_${c.status}`))}</td>
                  <td>{simulate(c.id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
