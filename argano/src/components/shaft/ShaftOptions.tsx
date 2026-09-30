'use client';

// The choices of a shaft design: rated load (the largest car, or a given load), doors, counterweight, accessibility
// and, folded away, the allowances with their typical values.
import { useTranslations } from 'next-intl';
import { DEFAULTS, type Allowance, type ShaftInputs } from '@/shaft';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
  /** kg used when switching to a given load */
  lastQ: number;
}

const ALLOWANCES = Object.keys(DEFAULTS) as Allowance[];
const int = (s: string): number => Math.round(Number(s.replace(',', '.')));

function Seg<T extends string>({ name, value, options, label, onChange }: { name: string; value: T; options: readonly { v: T; label: string }[]; label: string; onChange(v: T): void }) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="seg-row" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <label key={o.v} className={value === o.v ? 'on' : undefined}>
            <input type="radio" name={name} value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function ShaftOptions({ I, set, lastQ }: Props) {
  const t = useTranslations('shaft');
  const num = (key: 'Q' | 'doorWidth' | Allowance, label: string, min: number, max: number, step = 10) => (
    <label className="field">
      <span>{label}</span>
      <input className="input num" type="number" inputMode="numeric" min={min} max={max} step={step} value={I[key] ?? ''}
        onChange={(e) => { const v = int(e.target.value); if (Number.isFinite(v)) set({ [key]: v }); }} />
    </label>
  );
  return (
    <div className="shaft-options">
      <Seg name="qmode" label={t('Qmode')} value={I.Q === null ? 'max' : 'given'} onChange={(v) => set({ Q: v === 'max' ? null : lastQ })}
        options={[{ v: 'max', label: t('Qmax') }, { v: 'given', label: t('Qgiven') }]} />
      {I.Q !== null ? num('Q', t('Q'), 100, 10000, 5) : null}
      <Seg name="door" label={t('door')} value={I.door} onChange={(door) => set({ door })} options={[{ v: 'T2', label: t('T2') }, { v: 'C2', label: t('C2') }]} />
      {num('doorWidth', t('doorWidth'), 500, 2500, 50)}
      <Seg name="cw" label={t('cw')} value={I.cw} onChange={(cw) => set({ cw })}
        options={[{ v: 'rear', label: t('cw_rear') }, { v: 'left', label: t('cw_left') }, { v: 'right', label: t('cw_right') }]} />
      <label className="field">
        <span>{t('access')}</span>
        <select className="input" value={I.access} onChange={(e) => set({ access: e.target.value as ShaftInputs['access'] })}>
          {(['none', 'dm236_existing', 'dm236_residential', 'dm236_public'] as const).map((a) => <option key={a} value={a}>{t(`access_${a}`)}</option>)}
        </select>
      </label>
      <details className="allowances">
        <summary>{t('allowances')}</summary>
        <div className="form-grid">
          {ALLOWANCES.map((a) => <div key={a}>{num(a, t(`a_${a}`), 0, 800, 5)}</div>)}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => set({ ...DEFAULTS })}>{t('resetAllowances')}</button>
      </details>
    </div>
  );
}
