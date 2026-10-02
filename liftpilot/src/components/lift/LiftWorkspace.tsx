'use client';

// The installation in one screen: the one form on the left (the shaft, the floors, the machine room, the lift and its
// machine), everything the software works out and the 3D simulation on the right, live; every check with a button
// that replays it; the save, after which the server derives everything again and stores it.
import { useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition, type Ref } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import type { FormValues } from '@/calc/types';
import type { Edit } from '@/drawing';
import { KL, collaudoOf, deriveLift, type AutoFlags, type BottomScheme, type Collaudo, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { deflectorInputs, liftCandidate, type AdviceModel, type MachineCandidate } from '@/lib/lift/advice';
import type { CatalogChoice } from '@/lib/lift/catalog';
import { mirrorRopes, proposalValues } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { visibleBad } from '@/lib/calc-input';
import type { CalcKey } from '@/lib/present/tr';
import { shaftInputsSchema, type ShaftSource } from '@/lib/shaft-input';
import { editShaft } from '@/lib/shaft-edit';
import { saveLiftDesignAction } from '@/server/lift-actions';
import { DEFAULTS, editValue, keptPlan, type ShaftInputs } from '@/shaft';
import { asCalcDict } from '../calc/dict';
import ShaftOptions from '../shaft/ShaftOptions';
import VerticalOptions from '../shaft/VerticalOptions';
import RoomOptions from '../shaft/RoomOptions';
import HeadOptions from '../shaft/HeadOptions';
import ImbottiOptions from '../shaft/ImbottiOptions';
import NicheOptions from '../shaft/NicheOptions';
import PanevBom from '../shaft/PanevBom';
import PlanEditor from '../shaft/PlanEditor';
import type { Refusal } from '../drawing/EditableDrawing';
import SurveyPanel, { type SurveyResult } from '../shaft/SurveyPanel';
import CollaudoOptions from './CollaudoOptions';
import LiftCalcFields from './LiftCalcFields';
import LiftFacts from './LiftFacts';
import LiftChecks from './LiftChecks';
import LiftSimulator, { type SimApi } from './LiftSimulator';
import MachineAdvice from './MachineAdvice';

interface Props {
  projectId: string;
  initial: LiftInputs;
  /** the inputs and what they give, each time they settle (the standalone page draws the sheets from them) */
  onDerived?(inputs: LiftInputs, derived: LiftDerived): void;
  /** changes from outside the form: a dimension of the sheets (the standalone page) */
  api?: Ref<WorkspaceApi>;
  /** the company's prices [cents by key] for whoever may see them; null: none shown */
  prices: Readonly<Record<string, number>> | null;
}

/** The largest height of the diverting pulley under the sheave a drawing may set [mm]. */
const CALC_H_MAX = 3000;

/** The key of the shaft's form label for a value at `path` of the shaft's inputs (the path itself when none). */
function shaftLabelKey(path: readonly PropertyKey[]): string {
  const [a, b] = path.map(String);
  if (b && a === 'vertical') return `vt_${b}`;
  if (b && a === 'room') return `rm_${b}`;
  if (b && a === 'imbotti') return `im_${b}`;
  return a && a in DEFAULTS ? `a_${a}` : a ?? '';
}

/** An issue of the geometry as the field it is fixed in. */
const ISSUE_FIELD: Readonly<Record<string, string>> = { calata: 'n_D', rinvio: 'h' };

export interface WorkspaceApi {
  /** a dimension of the drawings given a new length: null when applied, else why not */
  edit(e: Edit, length: number): Refusal | null;
}

export default function LiftWorkspace({ projectId, initial, onDerived, api, prices }: Props) {
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
  // the advice verifies every model of SICOR and Montanari with the inputs as they settle; with direct pull also with
  // the diverting pulley, for when no machine takes the sheave of the rope drop
  const evaluate = useCallback((m: AdviceModel) => liftCandidate(deferred, m), [deferred]);
  const alternative = useMemo(() => {
    const d = deflectorInputs(deferred);
    return d ? { evaluate: (m: AdviceModel) => liftCandidate(d, m), sheave: derived.machine.D } : null;
  }, [deferred, derived]);
  const bad = useMemo(() => new Set(visibleBad([...derived.analysis.ctx.bad, ...derived.issues], derived.values)), [derived]);
  // what the save would refuse, as the server refuses it, named as the form names it: every value of the calculation out
  // of range (shown or not), each issue of the geometry, every value of the shaft out of the ranges the server accepts
  const nameOf = useCallback((field: string): string => {
    if (field.startsWith('shaft.')) {
      const path = field.slice(6).split('.'), key = shaftLabelKey(path);
      return ts.has(key) ? ts(key) : path.join('.');
    }
    const id = ISSUE_FIELD[field] ?? field.replace(/^calc\./, '');
    return P.t(id.replace(/^[no]_/, '') as CalcKey) + (id.startsWith('o_') ? ` (${P.t('g_old')})` : '');
  }, [P, ts]);
  const refused = useMemo(() => {
    const r = shaftInputsSchema.safeParse(deferred.shaft);
    const shaft = r.success ? [] : r.error.issues.map((i) => `shaft.${i.path.map(String).join('.')}`);
    return [...new Set([...derived.analysis.ctx.bad, ...derived.issues, ...shaft].map(nameOf))];
  }, [deferred.shaft, derived, nameOf]);
  useEffect(() => { onDerived?.(deferred, derived); }, [deferred, derived, onDerived]);
  const sim = useRef<SimApi>(null);

  const setShaft = (patch: Partial<ShaftInputs>): void => {
    if (typeof patch.Q === 'number') setLastQ(patch.Q);
    // the distances set by hand go with the arrangement they belong to
    setInp((p) => {
      const shaft = { ...p.shaft, ...patch };
      return { ...p, shaft: { ...shaft, plan: keptPlan(p.shaft, shaft) } };
    });
    setSaveError(null);
  };
  const setCalc = (patch: FormValues): void => {
    setInp((p) => ({ ...p, calc: mirrorRopes({ ...p.calc, ...patch }) }));
    setSaveError(null);
  };
  // a value of the calculation a drawing of the machine room shows: the diverting pulley's height under the sheave [mm],
  // never below it (the calculation takes h ≥ 0)
  const setCalcFromDrawing = (key: string, value: number): Refusal | null => {
    if (key !== 'calc.h') return { min: null, max: null };
    if (!Number.isFinite(value) || value < 0 || value > CALC_H_MAX) return { min: 0, max: CALC_H_MAX };
    setCalc({ h: value / 1000 });
    return null;
  };
  useImperativeHandle(api, () => ({
    edit(e, length) {
      if (e.key.startsWith('calc.')) return setCalcFromDrawing(e.key, editValue(e, length));
      // the support the drawings show: the bedplate with the diverting pulley when none was chosen
      const R = inp.shaft.room, shaft = R && !R.support && derived.machine.rinvio ? { ...inp.shaft, room: { ...R, support: { kind: 'rinvio' as const } } } : inp.shaft;
      const r = editShaft(shaft, e, length);
      if (!r.ok) return r;
      setShaft(r.inputs);
      return null;
    },
  }));
  const setBottom = (bottom: BottomScheme): void => {
    setInp((p) => ({ ...p, bottom }));
    setSaveError(null);
  };
  const setCollaudo = (collaudo: Collaudo): void => {
    setInp((p) => ({ ...p, collaudo }));
    setSaveError(null);
  };
  const setCatalog = (catalog: CatalogChoice | undefined): void => {
    setInp((p) => {
      const { catalog: _drop, ...rest } = p;
      void _drop;
      return catalog ? { ...rest, catalog } : rest;
    });
    setSaveError(null);
  };
  // the machine of the advice: its maker and model, proposed by the software (with the diverting pulley when the
  // advice found it with one)
  const takeMachine = (c: MachineCandidate): void => {
    setInp((p) => ({
      ...p, calc: p.calc.layout === c.I.layout ? p.calc : mirrorRopes({ ...p.calc, layout: c.I.layout }),
      catalog: { brand: c.brand, model: c.model }, auto: { ...p.auto, machine: true },
    }));
    setSaveError(null);
  };
  const machineInUse = (c: MachineCandidate): boolean => derived.origin.machine === 'auto' && derived.values.layout === c.I.layout
    && derived.catalog?.fit?.machine.brand === c.brand && derived.catalog.fit.machine.model === c.model;
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
  // the shaft measured on a drawing: the car and what stands round it follow its size, as with the fields
  const onSurvey = (r: SurveyResult): void => {
    setShaft({ W: r.W, D: r.D });
    setSource(r.source);
  };
  const save = (): void => {
    setSaveError(null);
    startSaving(async () => {
      const r = await saveLiftDesignAction({ projectId, inputs: inp, source, label });
      if (r.ok) router.push(`/app/lift-designs/${r.id}`);
      else setSaveError(`${te(r.error)}${r.fields?.length ? `: ${[...new Set(r.fields.map(nameOf))].join(', ')}` : ''}`);
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
        <CollaudoOptions P={P} isNew={context === 'new'} chosen={inp.collaudo} value={collaudoOf(inp.calc, inp.collaudo)} set={setCollaudo}
          access={{ value: inp.shaft.access, set: (access) => setShaft({ access }) }} />
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
        <NicheOptions I={inp.shaft} set={setShaft} />
        <HeadOptions I={inp.shaft} set={setShaft} />
        <ImbottiOptions I={inp.shaft} set={setShaft} />
        <h2>{t('s_floors')}</h2>
        <VerticalOptions I={inp.shaft} set={setShaft} open />
        {above ? <RoomOptions I={inp.shaft} set={setShaft} machine={{ D: derived.machine.D, shimsAxis: KL.sheaveAxisPerD * derived.machine.D, shape: derived.machine.shape ?? null, rinvio: derived.machine.rinvio ?? null }} /> : null}
        <h2>{t('s_drive')}</h2>
        <LiftCalcFields P={P} X={X} inp={inp} derived={derived} bad={bad} setCalc={setCalc} setAuto={setAuto} setBottom={setBottom} setCatalog={setCatalog} t={(k, v) => t(k, v)} />
      </form>
      <div className="lift-main">
        <LiftFacts derived={derived} X={X} fmt={P.fmt} />
        <MachineAdvice evaluate={evaluate} alternative={alternative} fmt={P.fmt} inUse={machineInUse} onUse={takeMachine} where="design" />
        <LiftSimulator derived={derived} fmt={P.fmt} api={sim} />
        <section className="panel"><PlanEditor I={inp.shaft} onChange={setShaft} machine={above ? derived.machine : null} onCalc={setCalcFromDrawing} id="lift-plan" /></section>
        <LiftChecks derived={derived} X={X} fmt={P.fmt} onSimulate={(req) => sim.current?.play(req)} />
        <PanevBom L={derived.layout} fmt={P.fmt} prices={prices} />
      </div>
      <div className="savebar">
        <div className="inner">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={t('label')} aria-label={t('label')} />
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || refused.length > 0}>{saving ? t('saving') : t('save')}</button>
          <span className={refused.length ? 'note bad' : 'note'}>{refused.length ? t('fix_list', { list: refused.join(', ') }) : t('save_hint')}</span>
          {saveError ? <span className="note bad" role="alert">{saveError}</span> : null}
        </div>
      </div>
    </div>
  );
}
