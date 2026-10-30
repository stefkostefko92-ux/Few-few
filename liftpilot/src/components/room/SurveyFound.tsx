'use client';

// What the survey finds in the machine room besides the room, the shaft and the drops (src/lib/room/survey.ts, round
// 36): the existing governor on the floor (the middle of its footprint from the room's inner corner, its size, whether
// its ropes go through the slab under it), the slab's existing openings, and what the existing machine stands on and
// whether it stays. All optional: what is not entered is not there for the checks. Round 52: each field with its «?».
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { EXISTING_SUPPORTS, type Survey, type SurveyGovernor, type SurveyOpening } from '@/lib/room/survey';
import { mmOf } from '../blank';
import Campo, { ConAiuto } from '../shaft/Campo';

interface Props {
  survey: Survey;
  onChange: (next: Survey) => void;
}

const GOV: SurveyGovernor = { x: 600, y: 600, W: 400, D: 300, ropes: true };
const OPENING: SurveyOpening = { x: 600, y: 600, W: 200, D: 150 };
const OPENING_AIUTO = { x: testoAiuto(AIUTO, 'openingX'), y: testoAiuto(AIUTO, 'openingY'), w: testoAiuto(AIUTO, 'openingW'), d: testoAiuto(AIUTO, 'openingD') } as const;

export default function SurveyFound({ survey: s, onChange }: Props) {
  const t = useTranslations('room');
  const field = (id: string, text: string, aiuto: string | null, value: number, put: (v: number) => void, min = 0, max = 10000) => (
    <Campo id={id} nome={text} aiuto={aiuto}>
      <input id={id} className="input num" type="number" inputMode="numeric" min={min} max={max} step={5} value={value}
        onChange={(e) => { const v = mmOf(e.target.value); if (v !== null && v >= min && v <= max) put(v); }} />
    </Campo>
  );
  const check = (text: string, aiuto: string | null, on: boolean, put: (on: boolean) => void) => (
    <ConAiuto aiuto={aiuto} nome={text}>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => put(e.target.checked)} />
        <span>{text}</span>
      </label>
    </ConAiuto>
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
      {check(t('govHas'), testoAiuto(AIUTO, 'govHas'), gov !== undefined, (on) => putGov(on ? GOV : undefined))}
      {gov ? (
        <div className="form-grid">
          {field('sf-gov-x', t('govX'), testoAiuto(AIUTO, 'govX'), gov.x, (v) => putGov({ ...gov, x: v }))}
          {field('sf-gov-y', t('govY'), testoAiuto(AIUTO, 'govY'), gov.y, (v) => putGov({ ...gov, y: v }))}
          {field('sf-gov-w', t('govW'), testoAiuto(AIUTO, 'govW'), gov.W, (v) => putGov({ ...gov, W: v }), 100, 2000)}
          {field('sf-gov-d', t('govD'), testoAiuto(AIUTO, 'govD'), gov.D, (v) => putGov({ ...gov, D: v }), 100, 2000)}
          {check(t('govRopes'), testoAiuto(AIUTO, 'govRopes'), gov.ropes, (ropes) => putGov({ ...gov, ropes }))}
        </div>
      ) : null}
      <h4>{t('openingsTitle')}</h4>
      {openings.map((o, i) => (
        <div className="form-grid" key={i}>
          {field(`sf-op-${i}-x`, t('openingX'), OPENING_AIUTO.x, o.x, (v) => putOpenings(openings.map((p, j) => (j === i ? { ...p, x: v } : p))))}
          {field(`sf-op-${i}-y`, t('openingY'), OPENING_AIUTO.y, o.y, (v) => putOpenings(openings.map((p, j) => (j === i ? { ...p, y: v } : p))))}
          {field(`sf-op-${i}-w`, t('openingW'), OPENING_AIUTO.w, o.W, (v) => putOpenings(openings.map((p, j) => (j === i ? { ...p, W: v } : p))), 20, 3000)}
          {field(`sf-op-${i}-d`, t('openingD'), OPENING_AIUTO.d, o.D, (v) => putOpenings(openings.map((p, j) => (j === i ? { ...p, D: v } : p))), 20, 3000)}
          <button type="button" className="btn btn-sm" onClick={() => putOpenings(openings.filter((_, j) => j !== i))}>{t('openingRemove')}</button>
        </div>
      ))}
      {openings.length < 12 ? <button type="button" className="btn btn-sm" onClick={() => putOpenings([...openings, OPENING])}>{t('openingAdd')}</button> : null}
      <h4>{t('oldSupportTitle')}</h4>
      <div className="form-grid">
        <Campo id="sf-old-support" nome={t('oldSupport')} aiuto={testoAiuto(AIUTO, 'oldSupport')}>
          <select id="sf-old-support" className="input" value={old?.kind ?? ''} onChange={(e) => putOld(e.target.value, old?.keep ?? false)}>
            <option value="">{t('oldSupport_none')}</option>
            {EXISTING_SUPPORTS.map((k) => <option key={k} value={k}>{t(`oldSupport_${k}`)}</option>)}
          </select>
        </Campo>
        {old ? check(t('oldSupportKeep'), testoAiuto(AIUTO, 'oldSupportKeep'), old.keep, (keep) => putOld(old.kind, keep)) : null}
      </div>
    </>
  );
}
