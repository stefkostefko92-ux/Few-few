'use client';

// The data of the installation for sheet 1 of the drawing sets: what the calculation and the shaft design do not say
// (control, doors, frame, rails and brackets, governor, safety gear, buffers, masses, power supply). Every field is
// optional; the server validates the whole with the same zod schema before it stores it on the project.
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import type { Plant } from '@/lib/plant';
import { KV_VERT } from '@/shaft/norme-vert';
import { savePlantAction } from '@/server/drawing-actions';

type TextKey = 'machine' | 'control' | 'shaft' | 'carFinish' | 'landingDoors' | 'carDoors' | 'carFrame' | 'carBrackets' | 'cwBrackets' | 'governor' | 'governorRope' | 'carBuffers' | 'cwBuffers';
type NumKey = 'carBracketPitch' | 'cwBracketPitch' | 'governorLoad' | 'dynFactor' | 'currentIn' | 'currentStart' | 'voltage' | 'lightVoltage' | 'frequency' | 'duty'
  | 'massShell' | 'massFloor' | 'massDoors' | 'massFrame' | 'massCables' | 'massMachine';

export default function PlantForm({ projectId, initial, readOnly }: { projectId: string; initial: Plant; readOnly: boolean }) {
  const t = useTranslations('tavole'), te = useTranslations('errors'), router = useRouter();
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
  const num = (k: NumKey, step = 1) => (
    <label className="field" key={k}>
      <span>{t(`f_${k}`)}</span>
      <input className="input num" type="number" inputMode="decimal" min={0} step={step} value={P[k] ?? ''} disabled={readOnly}
        placeholder={k === 'carBracketPitch' || k === 'cwBracketPitch' ? String(KV_VERT.bracketPitch) : undefined}
        onChange={(e) => { const v = e.target.value.replace(',', '.'); put({ [k]: v === '' ? undefined : Number(v) }); }} />
    </label>
  );
  const rails = (k: 'carRails' | 'cwRails') => (
    <label className="field" key={k}>
      <span>{t(`f_${k}`)}</span>
      <select className="input" value={P[k] ?? ''} disabled={readOnly} onChange={(e) => put({ [k]: e.target.value === 'new' || e.target.value === 'existing' ? e.target.value : undefined })}>
        <option value="">{t('r_unset')}</option>
        <option value="new">{t('r_new')}</option>
        <option value="existing">{t('r_existing')}</option>
      </select>
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
        <div className="form-grid">{(['machine', 'control', 'shaft', 'carFinish', 'landingDoors', 'carDoors', 'carFrame'] as const).map(text)}</div>
      </fieldset>
      <fieldset className="panel">
        <legend>{t('g_rails')}</legend>
        <div className="form-grid">
          {rails('carRails')}
          {text('carBrackets')}
          {num('carBracketPitch', 50)}
          {rails('cwRails')}
          {text('cwBrackets')}
          {num('cwBracketPitch', 50)}
        </div>
        <p className="note">{t('bracketRule', { pitch: KV_VERT.bracketPitch })}</p>
      </fieldset>
      <fieldset className="panel">
        <legend>{t('g_safety')}</legend>
        <div className="form-grid">
          {text('governor')}
          {text('governorRope')}
          {num('governorLoad', 10)}
          <label className="field">
            <span>{t('f_safetyGear')}</span>
            <select className="input" value={P.safetyGear ?? ''} disabled={readOnly}
              onChange={(e) => put({ safetyGear: e.target.value === 'progressive' || e.target.value === 'roller' || e.target.value === 'instantaneous' ? e.target.value : undefined })}>
              <option value="">{t('r_unset')}</option>
              {(['progressive', 'roller', 'instantaneous'] as const).map((g) => <option key={g} value={g}>{t(`s_${g}`)}</option>)}
            </select>
          </label>
          {text('carBuffers')}
          {text('cwBuffers')}
        </div>
      </fieldset>
      <fieldset className="panel">
        <legend>{t('g_masses')}</legend>
        <div className="form-grid">{(['massShell', 'massFloor', 'massDoors', 'massFrame', 'massCables', 'massMachine'] as const).map((k) => num(k))}{num('dynFactor', 0.1)}</div>
      </fieldset>
      <fieldset className="panel">
        <legend>{t('g_electric')}</legend>
        <div className="form-grid">{num('currentIn', 0.01)}{num('currentStart', 0.01)}{num('voltage')}{num('lightVoltage')}{num('frequency')}{num('duty')}</div>
      </fieldset>
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('saving') : t('save')}</button>
          {msg ? <span className={`note${msg.ok ? '' : ' bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span> : null}
        </div>
      )}
    </form>
  );
}
