'use client';

// The data of the installation for sheet 1 of the drawing sets: only what the calculation and the shaft design do not
// know (control, shaft, car finish, safety gear, the lift's use, the governor's load, the power supply), and folded the optional rest
// (the machine's name off the catalogue, the bracket pitches, the parts of the car mass). Doors, frame, rails, brackets,
// governor, buffers and masses come from the design (src/lib/plant.ts). A replacement's documents read fewer of them:
// only those are shown. Every field is optional; the server validates the whole with the same zod schema before it
// stores it on the project. Each field has its «?» (round 52, messages/aiuto/impianti.json); the bracket pitches, which
// the software's rule fills and no list of what is missing names, are the only ones «Semplice» hides.
import { useId, useState, useTransition, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { useRouter } from '@/i18n/routing';
import { testoAiuto } from '@/lib/aiuto';
import { makeFmt } from '@/lib/present/tr';
import { PLANT_RANGE, type Plant, type PlantNumber } from '@/lib/plant';
import { cwGearPicked } from '@/lib/tavole/cw-gear';
import { machineConflict } from '@/lib/tavole/machine-name';
import { KV_VERT } from '@/shaft/norme-vert';
import { savePlantAction } from '@/server/drawing-actions';
import AIUTO from '../../../messages/aiuto/impianti.json';
import Etichetta from '../aiuto/Etichetta';

type TextKey = 'machine' | 'control' | 'shaft' | 'carFinish';

const LIFT_USES = ['passengers', 'goods', 'goodsHeavy'] as const;
// the counterweight's safety gear over a space under the shaft and what trips it (sheet 1: P7 and its check)
const CW_GEARS = ['progressive', 'roller', 'instantaneous', 'pillar'] as const;
const CW_TRIPS = ['governor', 'rupture', 'rope'] as const;
// what only a whole lift's set reads: kept as entered on a machine room's set (the installation's data, one per
// project, serve its later sets too), not shown nor printed there — the form says so (round 46)
const WHOLE_ONLY: readonly (keyof Plant)[] = ['shaft', 'carFinish', 'liftUse', 'cwSafetyGear', 'cwGearTrip', 'currentIn', 'currentStart', 'carBracketPitch',
  'cwBracketPitch', 'massShell', 'massFloor', 'massDoors', 'massFrame'];
// left empty they are the rule's pitch (KV_VERT.bracketPitch), never in the issue's list of what is missing (issue-check.ts)
const ESPERTO: readonly (keyof Plant)[] = ['carBracketPitch', 'cwBracketPitch'];

/** `catalog`: the catalogue's machine the next drawing set carries (its latest design or calculation); the machine's name
 *  here must name its model, or the set is not issued. */
export default function PlantForm({ projectId, initial, readOnly, whole, catalog = null }: {
  projectId: string; initial: Plant; readOnly: boolean; whole: boolean; catalog?: { brand: string; model: string } | null;
}) {
  const t = useTranslations('tavole'), te = useTranslations('errors'), router = useRouter(), locale = useLocale(), uid = useId();
  const fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  const [P, setP] = useState<Plant>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const put = (patch: Partial<Plant>): void => { setP((prev) => ({ ...prev, ...patch })); setMsg(null); };
  const idOf = (k: keyof Plant, hint = false): string => `${uid}-${k}${hint ? '-hint' : ''}`;

  // a field: its label, the «?» beside it (outside the label: components/aiuto), the control, the hint under it (the
  // control's description)
  const campo = (k: keyof Plant, control: ReactNode, hint?: ReactNode) => (
    <div className={ESPERTO.includes(k) ? 'field esperto' : 'field'} key={k}>
      <Etichetta htmlFor={idOf(k)} className="field-label" aiuto={testoAiuto(AIUTO, k)} nome={t(`f_${k}`)}>{t(`f_${k}`)}</Etichetta>
      {control}
      {hint ? <small className="note" id={idOf(k, true)}>{hint}</small> : null}
    </div>
  );
  const text = (k: TextKey) => campo(k,
    <input id={idOf(k)} className="input" value={P[k] ?? ''} maxLength={80} disabled={readOnly} onChange={(e) => put({ [k]: e.target.value.trim() ? e.target.value : undefined })} />);
  // the range the server accepts; any decimals (12,5 kg, 1750 mm); a number outside it is marked, as the refusal says
  const fuori = (k: PlantNumber): boolean => { const v = P[k]; return typeof v === 'number' && (!Number.isFinite(v) || v < PLANT_RANGE[k][0] || v > PLANT_RANGE[k][1]); };
  const num = (k: PlantNumber) => campo(k,
    <input id={idOf(k)} className="input num" type="number" inputMode="decimal" min={PLANT_RANGE[k][0]} max={PLANT_RANGE[k][1]} step="any" value={P[k] ?? ''} disabled={readOnly}
      placeholder={k === 'carBracketPitch' || k === 'cwBracketPitch' ? String(KV_VERT.bracketPitch) : undefined} aria-invalid={fuori(k) || undefined}
      onChange={(e) => { const v = e.target.value.replace(',', '.'); put({ [k]: v === '' ? undefined : Number(v) }); }} />);
  const save = (): void => {
    start(async () => {
      // numbers typed out of range are refused by the server as a whole
      const r = await savePlantAction({ projectId, plant: Object.fromEntries(Object.entries(P).filter(([, v]) => v !== undefined && !(typeof v === 'number' && !Number.isFinite(v)))) });
      setMsg(r.ok ? { ok: true, text: t('plantSaved') } : { ok: false, text: te(r.error) });
      if (r.ok) router.refresh();
    });
  };
  return (
    <form className="plant-form flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <fieldset className="panel">
        <legend>{t('g_plant')}</legend>
        <div className="form-grid">
          {text('control')}
          {whole ? text('shaft') : null}
          {whole ? text('carFinish') : null}
          {campo('safetyGear', (
            <select id={idOf('safetyGear')} className="input" value={P.safetyGear ?? ''} disabled={readOnly} aria-describedby={idOf('safetyGear', true)}
              onChange={(e) => put({ safetyGear: e.target.value === 'progressive' || e.target.value === 'roller' || e.target.value === 'instantaneous' ? e.target.value : undefined })}>
              <option value="">{t('r_unset')}</option>
              {(['progressive', 'roller', 'instantaneous'] as const).map((g) => <option key={g} value={g}>{t(`s_${g}`)}</option>)}
            </select>
          ), t('f_safetyGearHint', { v: fmt(KV_VERT.gearInstantV, 2) }))}
          {whole ? campo('liftUse', (
            <select id={idOf('liftUse')} className="input" value={P.liftUse ?? ''} disabled={readOnly} aria-describedby={idOf('liftUse', true)}
              onChange={(e) => put({ liftUse: LIFT_USES.find((u) => u === e.target.value) })}>
              <option value="">{t('r_unset')}</option>
              {LIFT_USES.map((u) => <option key={u} value={u}>{t(`u_${u}`)}</option>)}
            </select>
          ), t('f_liftUseHint', { q: KV_VERT.sillHeavyQ })) : null}
          {num('governorLoad')}
          {whole ? (
            <>
              {campo('cwSafetyGear', (
                <select id={idOf('cwSafetyGear')} className="input" value={P.cwSafetyGear ?? ''} disabled={readOnly} aria-describedby={idOf('cwSafetyGear', true)}
                  onChange={(e) => { const g = CW_GEARS.find((x) => x === e.target.value); setP((prev) => cwGearPicked(prev, g)); setMsg(null); }}>
                  <option value="">{t('r_unset')}</option>
                  {CW_GEARS.map((g) => <option key={g} value={g}>{t(`s_${g}`)}</option>)}
                </select>
              ), t('f_cwGearHint', { v: fmt(KV_VERT.cwGearInstantV, 0) }))}
              {campo('cwGearTrip', (
                <select id={idOf('cwGearTrip')} className="input" value={P.cwGearTrip ?? ''} disabled={readOnly || P.cwSafetyGear === 'pillar'}
                  onChange={(e) => put({ cwGearTrip: CW_TRIPS.find((g) => g === e.target.value) })}>
                  <option value="">{t('r_unset')}</option>
                  {CW_TRIPS.map((g) => <option key={g} value={g}>{t(`t_${g}`)}</option>)}
                </select>
              ))}
            </>
          ) : null}
        </div>
        <p className="note">{t(whole ? 'fromDesign' : 'fromCalc')}</p>
        {!whole && WHOLE_ONLY.some((k) => P[k] !== undefined) ? <p className="note">{t('keptWhole')}</p> : null}
      </fieldset>
      <fieldset className="panel">
        <legend>{t('g_electric')}</legend>
        <div className="form-grid">{whole ? <>{num('currentIn')}{num('currentStart')}</> : null}{num('voltage')}{num('lightVoltage')}{num('frequency')}{num('duty')}</div>
      </fieldset>
      {/* open when the machine's name already contradicts the calculation's */}
      <details className="panel" open={machineConflict(initial, catalog) || undefined}>
        <summary>{t('g_optional')}</summary>
        <div className="form-grid">
          {text('machine')}
          {catalog ? (
            <p className={`note${machineConflict(P, catalog) ? ' bad' : ''}`} role={machineConflict(P, catalog) ? 'alert' : undefined}>
              {machineConflict(P, catalog) ? t('machineCatalog', { catalog: `${catalog.brand} ${catalog.model}` }) : t('f_machineHint')}
            </p>
          ) : null}
          {whole ? <>{num('carBracketPitch')}{num('cwBracketPitch')}</> : null}
        </div>
        {whole ? <p className="note esperto">{t('bracketRule', { pitch: KV_VERT.bracketPitch })}</p> : null}
        {whole ? (
          <>
            <div className="form-grid">{(['massShell', 'massFloor', 'massDoors', 'massFrame'] as const).map((k) => num(k))}</div>
            <p className="note">{t('partsNote')}</p>
          </>
        ) : null}
      </details>
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('saving') : t('save')}</button>
          {msg ? <span className={`note${msg.ok ? '' : ' bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span> : null}
        </div>
      )}
    </form>
  );
}
