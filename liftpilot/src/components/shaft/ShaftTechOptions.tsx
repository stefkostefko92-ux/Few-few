'use client';

// The software's own choices in a shaft design, shown once the project's data are in: the doors' maker, the landing call
// stations, the rails, the overspeed governor, the counterweight's brackets and Panev's articles, and, folded away, the
// allowances with their typical values. A value still as the software set it carries the standard badge. Round 52: each
// field with its «?»; the whole block is a refinement the software keeps at its values, marked `esperto` (hidden in
// «Semplice», components/shell/Modalita.tsx).
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import {
  CW_SPECIALS, CW_SUPPORTS, DEFAULTS, DOOR_PAIRS, DOOR_PAIR_DEFAULT, GOVERNORS, RAIL_TYPES, callStationOf, cwBracketsOf, defaultInputs, freeSides, govSize, layout, railLabel, takesSpeed,
  type Allowance, type CwChoice, type DoorPairId, type RailType, type ShaftInputs,
} from '@/shaft';
import { ALLOWANCE_RANGE } from '@/lib/shaft-input';
import { StdBadge, mmOf } from '../blank';
import Campo, { ConAiuto } from './Campo';
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
  const t = useTranslations('shaft'), cs = callStationOf(I), uid = useId();
  const fid = (k: string): string => `${uid}-${k}`;
  // the side walls the governor's rope can run by (a central sling, free of doors and of the counterweight); the one the
  // software takes: the derivation's (clear of the machine in the room), else the last free one
  const L = layout(I), free = L.frame.kind === 'central' ? freeSides(L) : [], auto = govSide && free.includes(govSide) ? govSide : free.at(-1);
  const allowance = (a: Allowance) => (
    <Campo key={a} id={fid(a)} nome={t(`a_${a}`)} aiuto={testoAiuto(AIUTO, `a_${a}`)} label={<>{t(`a_${a}`)}<StdBadge on={I[a] === DEFAULTS[a]} /></>}>
      <input id={fid(a)} className="input num" type="number" inputMode="numeric" min={ALLOWANCE_RANGE[a][0]} max={ALLOWANCE_RANGE[a][1]} step={5} value={I[a]}
        onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) set({ [a]: v }); }} />
    </Campo>
  );
  return (
    <div className="shaft-options esperto">
      <Campo id={fid('dm')} nome={t('dm_title')} aiuto={testoAiuto(AIUTO, 'doorMaker')} label={<>{t('dm_title')}<StdBadge on={!I.doorMaker} /></>}>
        <select id={fid('dm')} className="input" value={I.doorMaker ?? 'generic'} onChange={(e) => set({ doorMaker: e.target.value as NonNullable<ShaftInputs['doorMaker']> })}>
          {(['generic', '2sg', 'fermator', 'dapa'] as const).map((m) => <option key={m} value={m}>{t(`dm_${m}`)}</option>)}
        </select>
      </Campo>
      <fieldset className="field call-station" aria-labelledby={fid('cs')}>
        <legend><ConAiuto aiuto={testoAiuto(AIUTO, 'cs_side')} nome={t('cs_title')}><span id={fid('cs')}>{t('cs_title')}<StdBadge on={!I.callStation} /></span></ConAiuto></legend>
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
            <Campo key={k} id={fid(`cs-${k}`)} nome={t(`cs_${k}`)} aiuto={k === 'offset' ? testoAiuto(AIUTO, 'cs_offset') : testoAiuto(AIUTO, 'cs_height')}>
              <input id={fid(`cs-${k}`)} className="input num" type="number" inputMode="numeric" min={k === 'offset' ? 0 : 600} max={2000} step={10} value={cs[k]}
                onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) set({ callStation: { ...cs, [k]: v } }); }} />
            </Campo>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        {(['carRail', 'cwRail'] as const).map((k) => (
          <Campo key={k} id={fid(k)} nome={t(k)} aiuto={k === 'carRail' ? testoAiuto(AIUTO, 'carRail') : testoAiuto(AIUTO, 'cwRail')} label={<>{t(k)}<StdBadge on={I[k] === STD[k]} /></>}>
            <select id={fid(k)} className="input" value={I[k]} onChange={(e) => set({ [k]: e.target.value as RailType })}>
              {RAIL_TYPES.map((r) => <option key={r} value={r}>{railLabel(r)}</option>)}
            </select>
          </Campo>
        ))}
      </div>
      <Campo id={fid('gov')} nome={t('gov_title')} aiuto={testoAiuto(AIUTO, 'governor')}>
        <select id={fid('gov')} className="input" value={I.governor ?? ''} onChange={(e) => set({ governor: e.target.value || undefined })}>
          <option value="">{t('gov_auto', { model: govSize(I.vertical.v).model })}</option>
          {GOVERNORS.filter((g) => takesSpeed(g, I.vertical.v)).map((g) => <option key={g.model} value={g.model}>{`${g.brand} ${g.model} · Ø ${2 * g.R} · ${g.vMin > 0 ? `${g.vMin}–${g.vMax}` : `≤ ${g.vMax}`} m/s`}</option>)}
        </select>
      </Campo>
      {free.length > 0 && auto ? (
        <Campo id={fid('gov-side')} nome={t('gov_side')} aiuto={testoAiuto(AIUTO, 'governorSide')} label={<>{t('gov_side')}<StdBadge on={!I.governorSide} /></>}>
          <select id={fid('gov-side')} className="input" value={I.governorSide ?? ''} aria-describedby={fid('gov-hint')} onChange={(e) => { const v = e.target.value; set({ governorSide: v === 'left' || v === 'right' ? v : undefined }); }}>
            <option value="">{t('gov_side_auto', { side: t(`gov_${auto}`) })}</option>
            {free.map((s) => <option key={s} value={s}>{t(`gov_${s}`)}</option>)}
          </select>
          <small className="note" id={fid('gov-hint')}>{t('gov_hint')}</small>
        </Campo>
      ) : null}
      <Seg name="cw-brackets" label={t('cb_title')} aiuto={testoAiuto(AIUTO, 'cwBrackets')} value={cwBracketsOf(I)} onChange={(cwBrackets) => set({ cwBrackets })}
        options={[{ v: 'panev', label: t('cb_panev') }, { v: 'generic', label: t('cb_generic') }]} />
      {cwBracketsOf(I) === 'panev' ? (
        <Campo id={fid('pv-cw')} nome={t('pv_cw')} aiuto={testoAiuto(AIUTO, 'pv_cw')}>
          <select id={fid('pv-cw')} className="input" value={I.panev?.cw ?? ''} onChange={(e) => { const v = e.target.value; set({ panev: withPanev(I, { cw: isCwChoice(v) ? v : undefined }) }); }}>
            <option value="">{t('pv_cw_auto')}</option>
            <optgroup label="SU · SD">{CW_SUPPORTS.filter((c) => !c.startsWith('SC')).map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
            <optgroup label="SC">{CW_SUPPORTS.filter((c) => c.startsWith('SC')).map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
            <optgroup label={t('pv_special')}>{CW_SPECIALS.map((c) => <option key={c} value={c}>{`${c} · ${t('pv_drawing')}`}</option>)}</optgroup>
          </select>
        </Campo>
      ) : null}
      <Campo id={fid('pv-door')} nome={t('pv_door')} aiuto={testoAiuto(AIUTO, 'pv_door')}>
        <select id={fid('pv-door')} className="input" value={I.panev?.door ?? ''} onChange={(e) => { const v = e.target.value; set({ panev: withPanev(I, { door: isDoorPair(v) ? v : undefined }) }); }}>
          <option value="">{t('pv_door_auto', { code: DOOR_PAIR_DEFAULT })}</option>
          {DOOR_PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Campo>
      <details className="allowances">
        <summary>{t('allowances')}</summary>
        <div className="form-grid">{ALLOWANCES.map(allowance)}</div>
        <button type="button" className="btn btn-sm" onClick={() => set({ ...DEFAULTS })}>{t('resetAllowances')}</button>
      </details>
    </div>
  );
}
