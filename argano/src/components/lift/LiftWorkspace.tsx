'use client';

// The installation in one screen: the one form on the left (the shaft, the floors, the machine room, the lift and its
// machine), everything the software works out and the 3D simulation on the right, live; every check with a button
// that replays it; the save, after which the server derives everything again and stores it.
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import type { FormValues } from '@/calc/types';
import { deriveLift, type AutoFlags, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { mirrorRopes, proposalValues } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { visibleBad } from '@/lib/calc-input';
import type { ShaftSource } from '@/lib/shaft-input';
import { saveLiftDesignAction } from '@/server/lift-actions';
import type { ShaftInputs } from '@/shaft';
import { asCalcDict } from '../calc/dict';
import ShaftOptions from '../shaft/ShaftOptions';
import VerticalOptions from '../shaft/VerticalOptions';
import RoomOptions from '../shaft/RoomOptions';
import SurveyPanel, { type SurveyResult } from '../shaft/SurveyPanel';
import LiftCalcFields from './LiftCalcFields';
import LiftFacts from './LiftFacts';
import LiftChecks from './LiftChecks';
import LiftSimulator, { type SimApi } from './LiftSimulator';

interface Props {
  projectId: string;
  initial: LiftInputs;
  /** the inputs and what they give, each time they settle (the standalone page draws the sheets from them) */
  onDerived?(inputs: LiftInputs, derived: LiftDerived): void;
}

export default function LiftWorkspace({ projectId, initial, onDerived }: Props) {
  const locale = useLocale(), messages = useMessages(), t = useTranslations('lift'), ts = useTranslations('shaft'), te = useTranslations('errors');
  const router = useRouter();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const [inp, setInp] = useState<LiftInputs>(initial);
  const [source, setSource] = useState<ShaftSource | null>(null);
  const [lastQ, setLastQ] = useState(initial.shaft.Q ?? 630);
  const [label, setLabel] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const deferred = useDeferredValue(inp);
  const derived = useMemo(() => deriveLift(deferred), [deferred]);
  const bad = useMemo(() => new Set(visibleBad([...derived.analysis.ctx.bad, ...derived.issues], derived.values)), [derived]);
  useEffect(() => { onDerived?.(deferred, derived); }, [deferred, derived, onDerived]);
  const sim = useRef<SimApi>(null);

  const setShaft = (patch: Partial<ShaftInputs>): void => {
    if (typeof patch.Q === 'number') setLastQ(patch.Q);
    setInp((p) => ({ ...p, shaft: { ...p.shaft, ...patch } }));
    setSaveError(null);
  };
  const setCalc = (patch: FormValues): void => {
    setInp((p) => ({ ...p, calc: mirrorRopes({ ...p.calc, ...patch }) }));
    setSaveError(null);
  };
  // a value switched to entered starts from the one the software showed, so nothing jumps
  const setAuto = (patch: Partial<AutoFlags>): void => {
    const pick = derived.analysis.sizing.pick;
    const ids: Readonly<Record<keyof AutoFlags, readonly string[]>> = {
      P: ['P'], L0: ['L0'], dx: ['dx'], Hv: ['Hv'], machine: derived.origin.machine === 'auto' && pick ? Object.keys(proposalValues(pick)) : [],
    };
    const seed: Record<string, string | number | boolean> = {};
    for (const k of Object.keys(patch) as (keyof AutoFlags)[]) {
      if (patch[k] !== false) continue;
      for (const id of ids[k]) {
        const v = derived.values[id];
        if (v !== undefined) seed[id] = v;
      }
    }
    setInp((p) => ({ ...p, auto: { ...p.auto, ...patch }, calc: mirrorRopes({ ...p.calc, ...seed }) }));
  };
  const setSize = (key: 'W' | 'D', value: string): void => {
    const v = Math.round(Number(value.replace(',', '.')));
    if (!Number.isFinite(v)) return;
    setShaft({ [key]: v });
    setSource(null);
  };
  const onSurvey = (r: SurveyResult): void => {
    setInp((p) => ({ ...p, shaft: { ...p.shaft, W: r.W, D: r.D } }));
    setSource(r.source);
  };
  const save = (): void => {
    setSaveError(null);
    startSaving(async () => {
      const r = await saveLiftDesignAction({ projectId, inputs: inp, source, label });
      if (r.ok) router.push(`/app/lift-designs/${r.id}`);
      else setSaveError(`${te(r.error)}${r.fields?.length ? `: ${r.fields.join(', ')}` : ''}`);
    });
  };
  const context = inp.calc.context === 'new' ? 'new' : 'repl', above = derived.values.layout !== 'bottom';
  return (
    <div className="lift-work">
      <form className="lift-form panel" autoComplete="off" noValidate onSubmit={(e) => e.preventDefault()}>
        <h2>{t('s_context')}</h2>
        <div className="seg-row" role="radiogroup" aria-label={t('s_context')}>
          {(['repl', 'new'] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={context === c} className={context === c ? 'on' : undefined} onClick={() => setCalc({ context: c })}>{t(`context_${c}`)}</button>
          ))}
        </div>
        <h2>{t('s_shaft')}</h2>
        <div className="form-grid">
          <label className="field"><span>{ts('W')}</span><input className="input num" type="number" inputMode="numeric" min={500} max={10000} step={10} value={inp.shaft.W} onChange={(e) => setSize('W', e.target.value)} /></label>
          <label className="field"><span>{ts('D')}</span><input className="input num" type="number" inputMode="numeric" min={500} max={10000} step={10} value={inp.shaft.D} onChange={(e) => setSize('D', e.target.value)} /></label>
        </div>
        <details className="survey">
          <summary>{t('from_cad')}</summary>
          <SurveyPanel onSurvey={onSurvey} />
        </details>
        <p className="note">{source ? ts('sourceCad', { file: source.file, format: source.format.toUpperCase() }) : ts('edited')}</p>
        <ShaftOptions I={inp.shaft} set={setShaft} lastQ={lastQ} />
        <h2>{t('s_floors')}</h2>
        <VerticalOptions I={inp.shaft} set={setShaft} open />
        {above ? <RoomOptions I={inp.shaft} set={setShaft} /> : null}
        <h2>{t('s_drive')}</h2>
        <LiftCalcFields P={P} X={X} inp={inp} derived={derived} bad={bad} setCalc={setCalc} setAuto={setAuto} t={(k) => t(k)} />
      </form>
      <div className="lift-main">
        <LiftFacts derived={derived} X={X} fmt={P.fmt} />
        <LiftSimulator derived={derived} fmt={P.fmt} api={sim} />
        <LiftChecks derived={derived} X={X} fmt={P.fmt} onSimulate={(req) => sim.current?.play(req)} />
      </div>
      <div className="savebar">
        <div className="inner">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={t('label')} aria-label={t('label')} />
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || bad.size > 0}>{saving ? t('saving') : t('save')}</button>
          <span className="note">{bad.size ? t('fix_fields') : t('save_hint')}</span>
          {saveError ? <span className="note bad" role="alert">{saveError}</span> : null}
        </div>
      </div>
    </div>
  );
}
