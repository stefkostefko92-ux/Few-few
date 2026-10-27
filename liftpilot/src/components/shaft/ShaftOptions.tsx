'use client';

// The shaft's data of a design: rated load (the largest car, or a given load), entrances and the second one's side,
// doors, the counterweight's side, the walls and the accessibility. A new installation starts with each to enter
// (src/lib/lift/blank.ts): nothing chosen, nothing written. The software's own choices (ShaftTechOptions) come once
// the project's data are in. Each field has its «?» (round 52, messages/aiuto/progetto.json).
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { REASON_LETTERS, counterweightSide, reasonText, type ShaftInputs } from '@/shaft';
import { Q_PLACEHOLDER, emptied, entrancesTo, filled } from '@/lib/lift/blank';
import { NO_BLANK, fieldId, mmOf, type FormBlank, type ShaftSet } from '../blank';
import { DalRilievo } from '../collega/origine';
import Campo from './Campo';
import Seg from './Seg';

interface Props {
  I: ShaftInputs;
  set: ShaftSet;
  blank?: FormBlank;
  /** the rated load fixed by the «Calcolo argano» the Progetto draws on (round 45): shown, not entered */
  fixedQ?: { kg: number; label: string };
}

const ACCESS = ['none', 'dm236_existing', 'dm236_residential', 'dm236_public'] as const;

export default function ShaftOptions({ I, set, blank = NO_BLANK, fixedQ }: Props) {
  const t = useTranslations('shaft'), tb = useTranslations('blank'), is = blank.is;
  // the load last given (kg): back to a given load, it is the one entered; none entered yet, its figure is to enter
  const [lastQ, setLastQ] = useState<number | null>(I.Q);
  const given = (): void => (lastQ === null ? set({ Q: Q_PLACEHOLDER }, (b) => emptied(b, ['Qkg'])) : set({ Q: lastQ }));
  const num = (key: 'doorWidth' | 'doorHeight' | 'wall', aiuto: string | null, min: number, max: number, step = 10) => (
    <Campo id={fieldId(key)} nome={t(key)} aiuto={aiuto} need={is(key)}>
      <input id={fieldId(key)} className="input num" type="number" inputMode="numeric" min={min} max={max} step={step} value={is(key) ? '' : I[key]}
        aria-required={is(key) || undefined} onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) set({ [key]: v }); }} />
    </Campo>
  );
  const one = is('entrances') || I.entrances === 'one';
  return (
    <div className="shaft-options">
      {fixedQ ? (
        <Campo id={fieldId('Qkg')} nome={t('Q')} aiuto={testoAiuto(AIUTO, 'Q')} label={<>{t('Q')}<span className="badge calcolo">{fixedQ.label}</span></>}>
          <input id={fieldId('Qkg')} className="input num" type="number" value={fixedQ.kg} readOnly aria-readonly="true" />
        </Campo>
      ) : (
        <Seg name="qmode" id={fieldId('Q')} need={is('Q')} label={t('Qmode')} aiuto={testoAiuto(AIUTO, 'Qmode')} value={is('Q') ? null : I.Q === null ? 'max' : 'given'}
          onChange={(v) => (v === 'max' ? set({ Q: null }) : given())} options={[{ v: 'max', label: t('Qmax') }, { v: 'given', label: t('Qgiven') }]} />
      )}
      {!fixedQ && !is('Q') && I.Q !== null ? (
        <Campo id={fieldId('Qkg')} nome={t('Q')} aiuto={testoAiuto(AIUTO, 'Qkg')} need={is('Qkg')} label={<>{t('Q')}<DalRilievo id="Qkg" value={is('Qkg') ? '' : I.Q} /></>}>
          <input id={fieldId('Qkg')} className="input num" type="number" inputMode="numeric" min={100} max={10000} step={5} value={is('Qkg') ? '' : I.Q}
            aria-required={is('Qkg') || undefined} onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) { setLastQ(v); set({ Q: v }, (b) => filled(b, ['Qkg'])); } }} />
        </Campo>
      ) : null}
      <Seg name="entrances" id={fieldId('entrances')} need={is('entrances')} label={t('entrances')} aiuto={testoAiuto(AIUTO, 'entrances')} value={is('entrances') ? null : I.entrances}
        onChange={(entrances) => set({ entrances }, (b) => entrancesTo(I, b, entrances))}
        options={[{ v: 'one', label: t('ent_one') }, { v: 'opposite', label: t('ent_opposite') }, { v: 'adjacent', label: t('ent_adjacent') }]} />
      {!is('entrances') && I.entrances === 'adjacent'
        ? <Seg name="side2" id={fieldId('side2')} need={is('side2')} label={t('side2')} aiuto={testoAiuto(AIUTO, 'side2')} value={is('side2') ? null : I.side2} onChange={(side2) => set({ side2 })}
            options={[{ v: 'left', label: t('side_left') }, { v: 'right', label: t('side_right') }]} />
        : null}
      <Seg name="door" id={fieldId('door')} need={is('door')} label={t('door')} aiuto={testoAiuto(AIUTO, 'door')} value={is('door') ? null : I.door} onChange={(door) => set({ door })}
        options={[{ v: 'T2', label: t('T2') }, { v: 'C2', label: t('C2') }]} />
      <div className="form-grid">
        {num('doorWidth', testoAiuto(AIUTO, 'doorWidth'), 500, 2500, 50)}
        {num('doorHeight', testoAiuto(AIUTO, 'doorHeight'), 1800, 3000, 50)}
      </div>
      {one
        ? <Seg name="cw" id={fieldId('cw')} need={is('cw')} label={t('cw')} aiuto={testoAiuto(AIUTO, 'cw')} value={is('cw') ? null : I.cw} onChange={(cw) => set({ cw })}
            options={[{ v: 'rear', label: t('cw_rear') }, { v: 'left', label: t('cw_left') }, { v: 'right', label: t('cw_right') }]} />
        : <p className="note">{t('cwForced', { side: t(`cw_${counterweightSide(I)}`).toLowerCase() })}</p>}
      <div className="form-grid">
        {num('wall', testoAiuto(AIUTO, 'wall'), 50, 1000, 10)}
        <Campo id={fieldId('access')} nome={t('access')} aiuto={testoAiuto(AIUTO, 'access')} need={is('access')}>
          <select id={fieldId('access')} className="input" value={is('access') ? '' : I.access} aria-required={is('access') || undefined}
            onChange={(e) => { const a = ACCESS.find((x) => x === e.target.value); if (a) set({ access: a }); }}>
            {is('access') ? <option value="" disabled>{tb('choose')}</option> : null}
            {ACCESS.map((a) => <option key={a} value={a}>{t(`access_${a}`)}</option>)}
          </select>
        </Campo>
      </div>
      {!is('access') && I.access === 'dm236_existing' ? (
        <Campo id="shaft-access-reason" nome={t('accessReason')} aiuto={testoAiuto(AIUTO, 'accessReason')}>
          <input id="shaft-access-reason" className="input" maxLength={300} value={I.accessReason ?? ''} aria-describedby="shaft-access-reason-hint"
            onChange={(e) => { const v = reasonText(e.target.value); set({ accessReason: v.trim() ? v : undefined }); }} />
          <span className="note" id="shaft-access-reason-hint">{t('accessReasonHint', { n: REASON_LETTERS })}</span>
        </Campo>
      ) : null}
    </div>
  );
}
