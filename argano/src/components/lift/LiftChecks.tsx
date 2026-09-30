'use client';

// Every check of the installation in one list: the machine's (traction, ropes, drive, brake, rescue) and the
// shaft's (plan, section, machine room), with value, limit and result; where the simulation can replay a check, a
// button runs it in 3D.
import { useTranslations } from 'next-intl';
import type { Check } from '@/calc/types';
import type { LiftDerived } from '@/lib/lift';
import type { Texts } from '@/lib/present/texts';
import { isUpperLimit, type ShaftCheck } from '@/shaft';
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
  // as in the report: the limit without a sign (its sense is in the check's name and clause)
  const calcLimit = (c: Check): string => (c.limit === null ? '' : fmt(c.limit, c.dec));
  return (
    <section className="lift-checks">
      <h2>{t('checks_title')}</h2>
      <div className="table-panel">
        <table className="data-table stack">
          <thead><tr><th>{t('col_check')}</th><th className="num">{t('col_value')}</th><th className="num">{t('col_limit')}</th><th>{t('col_result')}</th><th /></tr></thead>
          <tbody>
            {res.checks.map((c) => (
              <tr key={c.id}>
                <th scope="row">{X.checkText(c)}</th>
                <td className="num" data-label={t('col_value')}>{c.value === null ? '—' : fmt(c.value, c.dec)}</td>
                <td className="num note" data-label={t('col_limit')}>{calcLimit(c)}</td>
                <td data-label={t('col_result')}><span className={`status-pill ${c.status}`}>{X.st(c.status)}</span></td>
                <td>{simulate(c.id)}</td>
              </tr>
            ))}
            {L.checks.map((c) => {
              const unit = c.unit ? ` ${c.unit}` : '';
              return (
                <tr key={c.id}>
                  <th scope="row">{ts(`c_${c.id}`)}</th>
                  <td className="num" data-label={t('col_value')}>{c.value === null ? '—' : `${fmt(c.value, c.dec)}${unit}`}</td>
                  <td className="num note" data-label={t('col_limit')}>{c.limit === null ? '' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)}${unit}`}</td>
                  <td data-label={t('col_result')}><span className={`status-pill ${c.status}`}>{ts(`st_${c.status}`)}</span></td>
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
