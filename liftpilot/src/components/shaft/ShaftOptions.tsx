'use client';

// The choices of a shaft design: rated load (the largest car, or a given load), entrances, doors and their landing
// call stations, counterweight, rails, walls, accessibility and, folded away, the allowances with their typical values.
import { useTranslations } from 'next-intl';
import {
  CW_SPECIALS, CW_SUPPORTS, DEFAULTS, DOOR_PAIRS, DOOR_PAIR_DEFAULT, GOVERNORS, RAIL_TYPES, callStationOf, counterweightSide, cwBracketsOf, govSize, railLabel,
  type Allowance, type CwChoice, type DoorPairId, type RailType, type ShaftInputs,
} from '@/shaft';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
  /** kg used when switching to a given load */
  lastQ: number;
}

const ALLOWANCES = Object.keys(DEFAULTS) as Allowance[];
const isDoorPair = (x: string): x is DoorPairId => DOOR_PAIRS.some((p) => p === x);
const isCwChoice = (x: string): x is CwChoice => CW_SUPPORTS.some((p) => p === x) || CW_SPECIALS.some((p) => p === x);

/** Panev's articles with one choice changed: absent when nothing is chosen by hand (the inputs stay as before). */
function withPanev(I: ShaftInputs, patch: { door?: DoorPairId; cw?: CwChoice }): ShaftInputs['panev'] {
  const next = { ...I.panev, ...patch }, out: NonNullable<ShaftInputs['panev']> = {};
  if (next.door) out.door = next.door;
  if (next.cw) out.cw = next.cw;
  return out.door || out.cw ? out : undefined;
}
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
  const t = useTranslations('shaft'), cs = callStationOf(I);
  const num = (key: 'Q' | 'doorWidth' | 'doorHeight' | 'wall' | Allowance, label: string, min: number, max: number, step = 10) => (
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
      <Seg name="entrances" label={t('entrances')} value={I.entrances} onChange={(entrances) => set({ entrances })}
        options={[{ v: 'one', label: t('ent_one') }, { v: 'opposite', label: t('ent_opposite') }, { v: 'adjacent', label: t('ent_adjacent') }]} />
      {I.entrances === 'adjacent'
        ? <Seg name="side2" label={t('side2')} value={I.side2} onChange={(side2) => set({ side2 })} options={[{ v: 'left', label: t('side_left') }, { v: 'right', label: t('side_right') }]} />
        : null}
      <Seg name="door" label={t('door')} value={I.door} onChange={(door) => set({ door })} options={[{ v: 'T2', label: t('T2') }, { v: 'C2', label: t('C2') }]} />
      {num('doorWidth', t('doorWidth'), 500, 2500, 50)}
      {num('doorHeight', t('doorHeight'), 1800, 3000, 50)}
      <label className="field">
        <span>{t('dm_title')}</span>
        <select className="input" value={I.doorMaker ?? 'generic'} onChange={(e) => set({ doorMaker: e.target.value as NonNullable<ShaftInputs['doorMaker']> })}>
          {(['generic', '2sg', 'fermator', 'dapa'] as const).map((m) => <option key={m} value={m}>{t(`dm_${m}`)}</option>)}
        </select>
      </label>
      <fieldset className="field call-station">
        <legend>{t('cs_title')}</legend>
        <div className="seg-row" role="radiogroup" aria-label={t('cs_side')}>
          {(['left', 'right'] as const).map((side) => (
            <label key={side} className={cs.side === side ? 'on' : undefined}>
              <input type="radio" name="cs-side" value={side} checked={cs.side === side} onChange={() => set({ callStation: { ...cs, side } })} />
              {t(`cs_${side}`)}
            </label>
          ))}
        </div>
        <div className="form-grid">
          {(['offset', 'height'] as const).map((k) => (
            <label className="field" key={k}>
              <span>{t(`cs_${k}`)}</span>
              <input className="input num" type="number" inputMode="numeric" min={k === 'offset' ? 0 : 600} max={2000} step={10} value={cs[k]}
                onChange={(e) => { const v = int(e.target.value); if (Number.isFinite(v)) set({ callStation: { ...cs, [k]: v } }); }} />
            </label>
          ))}
        </div>
      </fieldset>
      {I.entrances === 'one'
        ? <Seg name="cw" label={t('cw')} value={I.cw} onChange={(cw) => set({ cw })}
            options={[{ v: 'rear', label: t('cw_rear') }, { v: 'left', label: t('cw_left') }, { v: 'right', label: t('cw_right') }]} />
        : <p className="note">{t('cwForced', { side: t(`cw_${counterweightSide(I)}`).toLowerCase() })}</p>}
      <div className="form-grid">
        {(['carRail', 'cwRail'] as const).map((k) => (
          <label className="field" key={k}>
            <span>{t(k)}</span>
            <select className="input" value={I[k]} onChange={(e) => set({ [k]: e.target.value as RailType })}>
              {RAIL_TYPES.map((r) => <option key={r} value={r}>{railLabel(r)}</option>)}
            </select>
          </label>
        ))}
        {num('wall', t('wall'), 50, 1000, 10)}
      </div>
      <label className="field">
        <span>{t('gov_title')}</span>
        <select className="input" value={I.governor ?? ''} onChange={(e) => set({ governor: e.target.value || undefined })}>
          <option value="">{t('gov_auto', { model: govSize(I.vertical.v).model })}</option>
          {GOVERNORS.filter((g) => I.vertical.v <= g.vMax).map((g) => <option key={g.model} value={g.model}>{`${g.brand} ${g.model} · Ø ${2 * g.R} · ≤ ${g.vMax} m/s`}</option>)}
        </select>
      </label>
      <Seg name="cw-brackets" label={t('cb_title')} value={cwBracketsOf(I)} onChange={(cwBrackets) => set({ cwBrackets })}
        options={[{ v: 'panev', label: t('cb_panev') }, { v: 'generic', label: t('cb_generic') }]} />
      {cwBracketsOf(I) === 'panev' ? (
        <label className="field">
          <span>{t('pv_cw')}</span>
          <select className="input" value={I.panev?.cw ?? ''} onChange={(e) => { const v = e.target.value; set({ panev: withPanev(I, { cw: isCwChoice(v) ? v : undefined }) }); }}>
            <option value="">{t('pv_cw_auto')}</option>
            <optgroup label="SU · SD">{CW_SUPPORTS.filter((c) => !c.startsWith('SC')).map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
            <optgroup label="SC">{CW_SUPPORTS.filter((c) => c.startsWith('SC')).map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
            <optgroup label={t('pv_special')}>{CW_SPECIALS.map((c) => <option key={c} value={c}>{`${c} · ${t('pv_drawing')}`}</option>)}</optgroup>
          </select>
        </label>
      ) : null}
      <label className="field">
        <span>{t('pv_door')}</span>
        <select className="input" value={I.panev?.door ?? ''} onChange={(e) => { const v = e.target.value; set({ panev: withPanev(I, { door: isDoorPair(v) ? v : undefined }) }); }}>
          <option value="">{t('pv_door_auto', { code: DOOR_PAIR_DEFAULT })}</option>
          {DOOR_PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
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
