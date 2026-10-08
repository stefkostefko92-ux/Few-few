'use client';

// The data of the installation for sheet 1 of the drawing sets: only what the calculation and the shaft design do not
// know (control, shaft, car finish, safety gear, the lift's use, the governor's load, the power supply), and folded the optional rest
// (the machine's name off the catalogue, the bracket pitches, the parts of the car mass). Doors, frame, rails, brackets,
// governor, buffers and masses come from the design (src/lib/plant.ts). A replacement's documents read fewer of them:
// only those are shown. Every field is optional; the server validates the whole with the same zod schema before it
// stores it on the project.
import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { useRouter } from '@/i18n/routing';
import { makeFmt } from '@/lib/present/tr';
import { PLANT_RANGE, type Plant, type PlantNumber } from '@/lib/plant';
import { machineConflict } from '@/lib/tavole/machine-name';
import { KV_VERT } from '@/shaft/norme-vert';
import { savePlantAction } from '@/server/drawing-actions';

type TextKey = 'machine' | 'control' | 'shaft' | 'carFinish';

const LIFT_USES = ['passengers', 'goods', 'goodsHeavy'] as const;

/** `catalog`: the catalogue's machine the next drawing set carries (its latest design or calculation); the machine's name
 *  here must name its model, or the set is not issued. */
export default function PlantForm({ projectId, initial, readOnly, whole, catalog = null }: {
  projectId: string; initial: Plant; readOnly: boolean; whole: boolean; catalog?: { brand: string; model: string } | null;
}) {
  const t = useTranslations('tavole'), te = useTranslations('errors'), router = useRouter(), locale = useLocale();
  const fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  const [P, setP] = useState<Plant>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const put = (patch: Partial<Plant>): void => { setP((prev) => ({ ...prev, ...patch })); setMsg(null); };

  const text = (k: TextKey) => (
    <label className="field" key={k}>
      <span>{t(`f_${k}`)}</span>
      <input className="input" value={P[k] ?? ''} maxLength={80} disabled={readOnly} onChange={(e) => put({ [k]: e.target.value.trim() ? e.target.value : undefined })} />
    </label>
  );
  // the range the server accepts; any decimals (12,5 kg, 1750 mm)
  const num = (k: PlantNumber) => (
    <label className="field" key={k}>
      <span>{t(`f_${k}`)}</span>
      <input className="input num" type="number" inputMode="decimal" min={PLANT_RANGE[k][0]} max={PLANT_RANGE[k][1]} step="any" value={P[k] ?? ''} disabled={readOnly}
        placeholder={k === 'carBracketPitch' || k === 'cwBracketPitch' ? String(KV_VERT.bracketPitch) : undefined}
        onChange={(e) => { const v = e.target.value.replace(',', '.'); put({ [k]: v === '' ? undefined : Number(v) }); }} />
    </label>
  );
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
          <label className="field">
            <span>{t('f_safetyGear')}</span>
            <select className="input" value={P.safetyGear ?? ''} disabled={readOnly}
              onChange={(e) => put({ safetyGear: e.target.value === 'progressive' || e.target.value === 'roller' || e.target.value === 'instantaneous' ? e.target.value : undefined })}>
              <option value="">{t('r_unset')}</option>
              {(['progressive', 'roller', 'instantaneous'] as const).map((g) => <option key={g} value={g}>{t(`s_${g}`)}</option>)}
            </select>
            <small className="note">{t('f_safetyGearHint', { v: fmt(KV_VERT.gearInstantV, 2) })}</small>
          </label>
          {whole ? (
            <label className="field">
              <span>{t('f_liftUse')}</span>
              <select className="input" value={P.liftUse ?? ''} disabled={readOnly}
                onChange={(e) => put({ liftUse: LIFT_USES.find((u) => u === e.target.value) })}>
                <option value="">{t('r_unset')}</option>
                {LIFT_USES.map((u) => <option key={u} value={u}>{t(`u_${u}`)}</option>)}
              </select>
              <small className="note">{t('f_liftUseHint', { q: KV_VERT.sillHeavyQ })}</small>
            </label>
          ) : null}
          {num('governorLoad')}
        </div>
        <p className="note">{t(whole ? 'fromDesign' : 'fromCalc')}</p>
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
        {whole ? <p className="note">{t('bracketRule', { pitch: KV_VERT.bracketPitch })}</p> : null}
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
