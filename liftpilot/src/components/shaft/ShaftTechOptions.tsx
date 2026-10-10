'use client';

// The software's own choices in a shaft design, shown once the project's data are in: the doors' maker, the landing call
// stations, the rails, the overspeed governor, the counterweight's brackets and Panev's articles, and, folded away, the
// allowances with their typical values. A value still as the software set it carries the standard badge.
import { useTranslations } from 'next-intl';
import {
  CW_SPECIALS, CW_SUPPORTS, DEFAULTS, DOOR_PAIRS, DOOR_PAIR_DEFAULT, GOVERNORS, RAIL_TYPES, callStationOf, cwBracketsOf, defaultInputs, freeSides, govSize, layout, railLabel, takesSpeed,
  type Allowance, type CwChoice, type DoorPairId, type RailType, type ShaftInputs,
} from '@/shaft';
import { ALLOWANCE_RANGE } from '@/lib/shaft-input';
import { StdBadge, mmOf } from '../blank';
import Seg from './Seg';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
  /** the governor rope's side the derivation took when it is left to the software (support.ts governorSideFor) */
  govSide?: 'left' | 'right';
}

const ALLOWANCES = Object.keys(DEFAULTS) as Allowance[];
const STD = defaultInputs(1000, 1000);
const isDoorPair = (x: string): x is DoorPairId => DOOR_PAIRS.some((p) => p === x);
const isCwChoice = (x: string): x is CwChoice => CW_SUPPORTS.some((p) => p === x) || CW_SPECIALS.some((p) => p === x);

/** Panev's articles with one choice changed: absent when nothing is chosen by hand (the inputs stay as before). */
function withPanev(I: ShaftInputs, patch: { door?: DoorPairId; cw?: CwChoice }): ShaftInputs['panev'] {
  const next = { ...I.panev, ...patch }, out: NonNullable<ShaftInputs['panev']> = {};
  if (next.door) out.door = next.door;
  if (next.cw) out.cw = next.cw;
  return out.door || out.cw ? out : undefined;
}

export default function ShaftTechOptions({ I, set, govSide }: Props) {
  const t = useTranslations('shaft'), cs = callStationOf(I);
  // the side walls the governor's rope can run by (a central sling, free of doors and of the counterweight); the one the
  // software takes: the derivation's (clear of the machine in the room), else the last free one
  const L = layout(I), free = L.frame.kind === 'central' ? freeSides(L) : [], auto = govSide && free.includes(govSide) ? govSide : free.at(-1);
  const allowance = (a: Allowance) => (
    <label className="field" key={a}>
      <span>{t(`a_${a}`)}<StdBadge on={I[a] === DEFAULTS[a]} /></span>
      <input className="input num" type="number" inputMode="numeric" min={ALLOWANCE_RANGE[a][0]} max={ALLOWANCE_RANGE[a][1]} step={5} value={I[a]}
        onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) set({ [a]: v }); }} />
    </label>
  );
  return (
    <div className="shaft-options">
      <label className="field">
        <span>{t('dm_title')}<StdBadge on={!I.doorMaker} /></span>
        <select className="input" value={I.doorMaker ?? 'generic'} onChange={(e) => set({ doorMaker: e.target.value as NonNullable<ShaftInputs['doorMaker']> })}>
          {(['generic', '2sg', 'fermator', 'dapa'] as const).map((m) => <option key={m} value={m}>{t(`dm_${m}`)}</option>)}
        </select>
      </label>
      <fieldset className="field call-station">
        <legend>{t('cs_title')}<StdBadge on={!I.callStation} /></legend>
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
                onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) set({ callStation: { ...cs, [k]: v } }); }} />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        {(['carRail', 'cwRail'] as const).map((k) => (
          <label className="field" key={k}>
            <span>{t(k)}<StdBadge on={I[k] === STD[k]} /></span>
            <select className="input" value={I[k]} onChange={(e) => set({ [k]: e.target.value as RailType })}>
              {RAIL_TYPES.map((r) => <option key={r} value={r}>{railLabel(r)}</option>)}
            </select>
          </label>
        ))}
      </div>
      <label className="field">
        <span>{t('gov_title')}</span>
        <select className="input" value={I.governor ?? ''} onChange={(e) => set({ governor: e.target.value || undefined })}>
          <option value="">{t('gov_auto', { model: govSize(I.vertical.v).model })}</option>
          {GOVERNORS.filter((g) => takesSpeed(g, I.vertical.v)).map((g) => <option key={g.model} value={g.model}>{`${g.brand} ${g.model} · Ø ${2 * g.R} · ${g.vMin > 0 ? `${g.vMin}–${g.vMax}` : `≤ ${g.vMax}`} m/s`}</option>)}
        </select>
      </label>
      {free.length > 0 && auto ? (
        <label className="field">
          <span>{t('gov_side')}<StdBadge on={!I.governorSide} /></span>
          <select className="input" value={I.governorSide ?? ''} onChange={(e) => { const v = e.target.value; set({ governorSide: v === 'left' || v === 'right' ? v : undefined }); }}>
            <option value="">{t('gov_side_auto', { side: t(`gov_${auto}`) })}</option>
            {free.map((s) => <option key={s} value={s}>{t(`gov_${s}`)}</option>)}
          </select>
          <small className="note">{t('gov_hint')}</small>
        </label>
      ) : null}
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
      <details className="allowances">
        <summary>{t('allowances')}</summary>
        <div className="form-grid">{ALLOWANCES.map(allowance)}</div>
        <button type="button" className="btn btn-sm" onClick={() => set({ ...DEFAULTS })}>{t('resetAllowances')}</button>
      </details>
    </div>
  );
}
