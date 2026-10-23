'use client';

// What the survey finds in the machine room besides the room, the shaft and the drops (src/lib/room/survey.ts, round
// 36): the existing governor on the floor (the middle of its footprint from the room's inner corner, its size, whether
// its ropes go through the slab under it), the slab's existing openings, and what the existing machine stands on and
// whether it stays. All optional: what is not entered is not there for the checks.
import { useTranslations } from 'next-intl';
import { EXISTING_SUPPORTS, type Survey, type SurveyGovernor, type SurveyOpening } from '@/lib/room/survey';
import { mmOf } from '../blank';

interface Props {
  survey: Survey;
  onChange: (next: Survey) => void;
}

const GOV: SurveyGovernor = { x: 600, y: 600, W: 400, D: 300, ropes: true };
const OPENING: SurveyOpening = { x: 600, y: 600, W: 200, D: 150 };

export default function SurveyFound({ survey: s, onChange }: Props) {
  const t = useTranslations('room');
  const field = (id: string, text: string, value: number, put: (v: number) => void, min = 0, max = 10000) => (
    <label className="field">
      <span>{text}</span>
      <input id={id} className="input num" type="number" inputMode="numeric" min={min} max={max} step={5} value={value}
        onChange={(e) => { const v = mmOf(e.target.value); if (v !== null && v >= min && v <= max) put(v); }} />
    </label>
  );
  const gov = s.governor, openings = s.openings ?? [], old = s.existingSupport;
  // the survey without one of its findings (none entered: none stored)
  const without = (key: 'governor' | 'openings' | 'existingSupport'): Survey => ({
    room: s.room, shaft: s.shaft, car: s.car, cw: s.cw,
    ...(key !== 'governor' && s.governor ? { governor: s.governor } : {}),
    ...(key !== 'openings' && s.openings ? { openings: s.openings } : {}),
    ...(key !== 'existingSupport' && s.existingSupport ? { existingSupport: s.existingSupport } : {}),
  });
  const putGov = (g: SurveyGovernor | undefined): void => onChange(g ? { ...s, governor: g } : without('governor'));
  const putOpenings = (os: readonly SurveyOpening[]): void => onChange(os.length ? { ...s, openings: [...os] } : without('openings'));
  const putOld = (kind: string, keep: boolean): void => {
    const k = EXISTING_SUPPORTS.find((x) => x === kind);
    onChange(k ? { ...s, existingSupport: { kind: k, keep } } : without('existingSupport'));
  };
  return (
    <>
      <h3>{t('foundTitle')}</h3>
      <p className="note">{t('foundHint')}</p>
      <label className="check">
        <input type="checkbox" checked={gov !== undefined} onChange={(e) => putGov(e.target.checked ? GOV : undefined)} />
        <span>{t('govHas')}</span>
      </label>
      {gov ? (
        <div className="form-grid">
          {field('sf-gov-x', t('govX'), gov.x, (v) => putGov({ ...gov, x: v }))}
          {field('sf-gov-y', t('govY'), gov.y, (v) => putGov({ ...gov, y: v }))}
          {field('sf-gov-w', t('govW'), gov.W, (v) => putGov({ ...gov, W: v }), 100, 2000)}
          {field('sf-gov-d', t('govD'), gov.D, (v) => putGov({ ...gov, D: v }), 100, 2000)}
          <label className="check">
            <input type="checkbox" checked={gov.ropes} onChange={(e) => putGov({ ...gov, ropes: e.target.checked })} />
            <span>{t('govRopes')}</span>
          </label>
        </div>
      ) : null}
      <h4>{t('openingsTitle')}</h4>
      {openings.map((o, i) => (
        <div className="form-grid" key={i}>
          {field(`sf-op-${i}-x`, t('openingX'), o.x, (v) => putOpenings(openings.map((p, j) => (j === i ? { ...p, x: v } : p))))}
          {field(`sf-op-${i}-y`, t('openingY'), o.y, (v) => putOpenings(openings.map((p, j) => (j === i ? { ...p, y: v } : p))))}
          {field(`sf-op-${i}-w`, t('openingW'), o.W, (v) => putOpenings(openings.map((p, j) => (j === i ? { ...p, W: v } : p))), 20, 3000)}
          {field(`sf-op-${i}-d`, t('openingD'), o.D, (v) => putOpenings(openings.map((p, j) => (j === i ? { ...p, D: v } : p))), 20, 3000)}
          <button type="button" className="btn btn-sm" onClick={() => putOpenings(openings.filter((_, j) => j !== i))}>{t('openingRemove')}</button>
        </div>
      ))}
      {openings.length < 12 ? <button type="button" className="btn btn-sm" onClick={() => putOpenings([...openings, OPENING])}>{t('openingAdd')}</button> : null}
      <h4>{t('oldSupportTitle')}</h4>
      <div className="form-grid">
        <label className="field">
          <span>{t('oldSupport')}</span>
          <select className="input" value={old?.kind ?? ''} onChange={(e) => putOld(e.target.value, old?.keep ?? false)}>
            <option value="">{t('oldSupport_none')}</option>
            {EXISTING_SUPPORTS.map((k) => <option key={k} value={k}>{t(`oldSupport_${k}`)}</option>)}
          </select>
        </label>
        {old ? (
          <label className="check">
            <input type="checkbox" checked={old.keep} onChange={(e) => putOld(old.kind, e.target.checked)} />
            <span>{t('oldSupportKeep')}</span>
          </label>
        ) : null}
      </div>
    </>
  );
}
