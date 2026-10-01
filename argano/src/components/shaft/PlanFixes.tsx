'use client';

// The distances of the plan that can be set by hand, in a table: each with its value now (set by hand, or worked out
// by the software), a field to set it, and the reset to the worked-out one; all of them reset at once. The same
// distances the drawing changes when its dimensions are clicked.
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { EditResult } from '@/lib/shaft-edit';
import { PLAN_KEYS, planValues, withValue, withoutFix, type Layout, type PlanKey, type ShaftInputs } from '@/shaft';

interface Props {
  I: ShaftInputs;
  L: Layout;
  name(key: PlanKey): string;
  onChange(next: ShaftInputs): void;
  check(next: ShaftInputs | null): EditResult;
  refused(min: number | null, max: number | null): string;
}

type ByKey = Partial<Record<PlanKey, string>>;
const without = (o: ByKey, key: PlanKey): ByKey => {
  const c: ByKey = {};
  for (const k of PLAN_KEYS) if (k !== key && o[k] !== undefined) c[k] = o[k];
  return c;
};

export default function PlanFixes({ I, L, name, onChange, check, refused }: Props) {
  const t = useTranslations('shaft');
  const [draft, setDraft] = useState<ByKey>({});
  const [errors, setErrors] = useState<ByKey>({});
  const values = planValues(L), keys = PLAN_KEYS.filter((k) => values[k] !== undefined), hand = keys.filter((k) => I.plan?.[k] !== undefined);

  const commit = (k: PlanKey): void => {
    const s = draft[k];
    if (s === undefined) return;
    setDraft((d) => without(d, k));
    const v = Math.round(Number(s.trim().replace(',', '.')));
    if (!s.trim() || !Number.isFinite(v)) {
      setErrors((e) => ({ ...e, [k]: refused(0, null) }));
      return;
    }
    setErrors((e) => without(e, k));
    if (v === Math.round(values[k] ?? Number.NaN)) return;
    const r = check(withValue(I, `plan.${k}`, v));
    if (r.ok) onChange(r.inputs);
    else setErrors((e) => ({ ...e, [k]: refused(r.min, r.max) }));
  };

  return (
    <details className="plan-fixes" open={hand.length > 0}>
      <summary>{t('fx_title', { n: hand.length })}</summary>
      <p className="note">{t('fx_lead')}</p>
      <div className="table-wrap">
        <table className="fixes">
          <thead>
            <tr><th scope="col">{t('fx_what')}</th><th scope="col">{t('fx_value')}</th><th scope="col">{t('fx_state')}</th><th scope="col"><span className="sr-only">{t('fx_reset')}</span></th></tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const set = I.plan?.[k] !== undefined, err = errors[k];
              return (
                <tr key={k} className={set ? 'hand' : undefined}>
                  <th scope="row">{name(k)}</th>
                  <td>
                    <input className="input num" type="number" inputMode="numeric" step={1} aria-label={name(k)} aria-invalid={err ? true : undefined}
                      value={draft[k] ?? String(Math.round(values[k] ?? 0))} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                      onBlur={() => commit(k)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(k); } }} />
                    {err ? <span className="note bad" role="alert">{err}</span> : null}
                  </td>
                  <td><span className={`badge${set ? ' hand' : ''}`}>{set ? t('fx_hand') : t('fx_auto')}</span></td>
                  <td>{set ? <button type="button" className="btn btn-sm" onClick={() => onChange(withoutFix(I, k))}>{t('fx_reset')}</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hand.length ? <button type="button" className="btn btn-sm" onClick={() => onChange({ ...I, plan: undefined })}>{t('fx_reset_all')}</button> : null}
    </details>
  );
}
