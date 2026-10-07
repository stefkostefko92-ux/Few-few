'use client';

// The installation in one screen: the one form on the left (LiftForm), everything the software works out and the 3D
// simulation on the right, live; every check with a button that replays it; the save, after which the server derives
// everything again and stores it. A new installation starts empty: until the project's data are in (and the new
// machine, when no proposal passes) the right side lists what is still to enter and nothing is worked out or drawn.
// The form's draft is kept as it is filled in.
import { useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition, type Ref } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import type { FormValues } from '@/calc/types';
import type { Edit } from '@/drawing';
import { deriveLift, type AutoFlags, type BottomScheme, type Collaudo, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { enteredBy, existingMissing, filled, layoutTo, missingOf, type BlankKey, type LiftDraft } from '@/lib/lift/blank';
import { drawnShaft, edited, enteredShaft, movedPanel, panelEntered } from '@/lib/lift/panel-form';
import { withPitches, type BracketPitches } from '@/shaft/brackets';
import { deflectorInputs, liftCandidate, type AdviceModel, type MachineCandidate } from '@/lib/lift/advice';
import type { CatalogChoice } from '@/lib/lift/catalog';
import { mirrorRopes, proposalValues } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { visibleBad } from '@/lib/calc-input';
import { liftDraftSchema } from '@/lib/draft-input';
import type { CalcKey } from '@/lib/present/tr';
import { shaftInputsSchema, type ShaftSource } from '@/lib/shaft-input';
import { editShaft } from '@/lib/shaft-edit';
import { saveLiftDesignAction } from '@/server/lift-actions';
import { DEFAULTS, editValue, keptPlan, type ShaftInputs } from '@/shaft';
import { asCalcDict } from '../calc/dict';
import MissingPanel from '../MissingPanel';
import type { ShaftSet } from '../blank';
import DraftBar from '../draft/DraftBar';
import { useDraft, type DraftTarget } from '../draft/useDraft';
import PanevBom from '../shaft/PanevBom';
import PlanEditor from '../shaft/PlanEditor';
import type { Refusal } from '../drawing/EditableDrawing';
import type { SurveyResult } from '../shaft/SurveyPanel';
import LiftFacts from './LiftFacts';
import LiftChecks from './LiftChecks';
import LiftForm from './LiftForm';
import LiftSimulator, { type SimApi } from './LiftSimulator';
import MachineAdvice from './MachineAdvice';
import { missingItems } from './missing-items';

interface Props {
  projectId: string;
  initial: LiftInputs;
  /** the project's values still to enter (src/lib/lift/blank.ts); absent: none */
  blank?: readonly BlankKey[];
  /** the inputs and what they give, each time they settle (the standalone page draws the sheets from them) */
  onDerived?(inputs: LiftInputs, derived: LiftDerived): void;
  /** changes from outside the form: a dimension of the sheets (the standalone page) */
  api?: Ref<WorkspaceApi>;
  /** the company's prices [cents by key] for whoever may see them; null: none shown */
  prices: Readonly<Record<string, number>> | null;
  /** the bracket pitches of the installation's data: the list and the 3D count with them (as sheet 1) */
  pitches?: BracketPitches;
  /** where the form's draft is kept; absent: none (the standalone page) */
  draft?: DraftTarget | null;
}

/** The largest height of the diverting pulley under the sheave a drawing may set [mm]. */
const CALC_H_MAX = 3000;

/** The key of the shaft's form label for a value at `path` of the shaft's inputs (the path itself when none). */
function shaftLabelKey(path: readonly PropertyKey[]): string {
  const [a, b] = path.map(String);
  if (b && a === 'vertical') return `vt_${b}`;
  if (b && a === 'room') return `rm_${b}`;
  if (b && a === 'imbotti') return `im_${b}`;
  if (b && a === 'frame') return `fr_${b}`;
  return a && a in DEFAULTS ? `a_${a}` : a ?? '';
}

/** An issue of the geometry as the field it is fixed in. */
const ISSUE_FIELD: Readonly<Record<string, string>> = { calata: 'n_D', rinvio: 'h' };

export interface WorkspaceApi {
  /** a dimension of the drawings given a new length: null when applied, else why not */
  edit(e: Edit, length: number): Refusal | null;
}

const isEmpty = (x: unknown): boolean => String(x ?? '').trim() === '';

export default function LiftWorkspace({ projectId, initial, blank: initialBlank = [], onDerived, api, prices, pitches, draft = null }: Props) {
  const locale = useLocale(), messages = useMessages(), t = useTranslations('lift'), ts = useTranslations('shaft'), te = useTranslations('errors'), tb = useTranslations('blank');
  const router = useRouter();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const [form, setForm] = useState<LiftDraft>({ inputs: initial, blank: initialBlank });
  const inp = form.inputs;
  const [source, setSource] = useState<ShaftSource | null>(null);
  const [label, setLabel] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // the inputs and what is still to enter settle together: nothing is drawn from a placeholder
  const deferred = useDeferredValue(form), dInp = deferred.inputs;
  const missing = useMemo(() => [...missingOf(deferred), ...existingMissing(deferred.inputs.calc)], [deferred]);
  const car = pitches?.car, cw = pitches?.cw;
  const derived = useMemo(() => {
    if (missing.length) return null;
    const d = deriveLift(dInp);
    return { ...d, layout: withPitches(d.layout, { car, cw }) };
  }, [missing, dInp, car, cw]);
  // the new machine's values still to enter: no proposal passes (or it is entered) and some are empty
  const machineMissing = useMemo(() => (derived
    ? visibleBad(derived.analysis.ctx.bad, derived.values).filter((id) => id.startsWith('n_') && isEmpty(derived.values[id])) : []), [derived]);
  const complete = derived !== null && machineMissing.length === 0;
  const need = useMemo(() => new Set<string>([...missing, ...machineMissing]), [missing, machineMissing]);
  // the advice verifies every model of SICOR and Montanari with the inputs as they settle; with direct pull also with
  // the diverting pulley, for when no machine takes the sheave of the rope drop
  const evaluate = useCallback((m: AdviceModel) => liftCandidate(dInp, m), [dInp]);
  const alternative = useMemo(() => {
    const d = derived ? deflectorInputs(dInp) : null;
    // the sheave a direct pull needs: the falls' spacing in the plan (a machine's own only once one is in)
    return d && derived ? { evaluate: (m: AdviceModel) => liftCandidate(d, m), sheave: Math.round(derived.calata ?? derived.machine.D) } : null;
  }, [dInp, derived]);
  const bad = useMemo(() => new Set(derived ? visibleBad([...derived.analysis.ctx.bad, ...derived.issues], derived.values).filter((id) => !need.has(id)) : []), [derived, need]);
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
    if (!derived) return [];
    const r = shaftInputsSchema.safeParse(dInp.shaft);
    const shaft = r.success ? [] : r.error.issues.map((i) => `shaft.${i.path.map(String).join('.')}`);
    return [...new Set([...derived.analysis.ctx.bad, ...derived.issues, ...shaft].map(nameOf))];
  }, [dInp.shaft, derived, nameOf]);
  useEffect(() => { if (derived) onDerived?.(dInp, derived); }, [dInp, derived, onDerived]);
  const sim = useRef<SimApi>(null);
  const draftValid = useMemo(() => liftDraftSchema.safeParse(form).success, [form]);
  const draftHandle = useDraft(draft, form, draftValid);
  const blank = useMemo(() => ({ is: (k: BlankKey) => form.blank.includes(k), list: form.blank, full: derived !== null }), [form.blank, derived]);
  const texts = { choose: tb('choose'), std: tb('std'), stdTitle: tb('stdTitle') };

  const setShaft: ShaftSet = (patch, edit) => {
    // the distances set by hand go with the arrangement they belong to; what the patch sets is entered
    setForm((f) => {
      const shaft = { ...f.inputs.shaft, ...patch };
      return { inputs: { ...f.inputs, shaft: { ...shaft, plan: keptPlan(f.inputs.shaft, shaft) } }, blank: filled(edit ? edit(f.blank) : f.blank, enteredBy(patch)) };
    });
    setSaveError(null);
  };
  // the drawings show the panel where the software put it and the HEB beams it took; moved or chosen there, entered
  const drawn = useMemo(() => drawnShaft(inp.shaft, derived), [inp.shaft, derived]);
  const setDrawn = (next: ShaftInputs): void => {
    const moved = movedPanel(next, derived);
    if (moved) setForm((f) => panelEntered(f, moved));
    setShaft(enteredShaft(next, inp.shaft, derived));
  };
  const setCalc = (patch: FormValues): void => {
    setForm((f) => {
      const roping = 'r' in patch ? filled(f.blank, ['r']) : f.blank;
      const blank = typeof patch.layout === 'string' ? layoutTo(String(f.inputs.calc.layout ?? ''), roping, patch.layout) : [...roping];
      return { inputs: { ...f.inputs, calc: mirrorRopes({ ...f.inputs.calc, ...patch }) }, blank };
    });
    setSaveError(null);
  };
  const setInputs = (change: (p: LiftInputs) => LiftInputs): void => {
    setForm((f) => ({ ...f, inputs: change(f.inputs) }));
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
      const r = editShaft(edited(drawn, e, derived), e, length);
      if (!r.ok) return r;
      setDrawn(r.inputs);
      return null;
    },
  }));
  const setBottom = (bottom: BottomScheme): void => {
    setForm((f) => ({ inputs: { ...f.inputs, bottom }, blank: filled(f.blank, ['bottom']) }));
    setSaveError(null);
  };
  const setCollaudo = (collaudo: Collaudo): void => setInputs((p) => ({ ...p, collaudo }));
  const setCatalog = (catalog: CatalogChoice | undefined): void => setInputs((p) => {
    const { catalog: _drop, ...rest } = p;
    void _drop;
    return catalog ? { ...rest, catalog } : rest;
  });
  // the machine of the advice: its maker and model, proposed by the software (with the diverting pulley when the
  // advice found it with one); a machine below brings the scheme of its ropes to choose
  const takeMachine = (c: MachineCandidate): void => {
    setForm((f) => {
      const p = f.inputs, same = p.calc.layout === c.I.layout;
      return {
        inputs: { ...p, calc: same ? p.calc : mirrorRopes({ ...p.calc, layout: c.I.layout }), catalog: { brand: c.brand, model: c.model }, auto: { ...p.auto, machine: true } },
        blank: same ? f.blank : layoutTo(String(p.calc.layout ?? ''), f.blank, c.I.layout),
      };
    });
    setSaveError(null);
  };
  const machineInUse = (c: MachineCandidate): boolean => !!derived && derived.origin.machine === 'auto' && derived.values.layout === c.I.layout
    && derived.catalog?.fit?.machine.brand === c.brand && derived.catalog.fit.machine.model === c.model;
  // a value switched to entered starts from the one the software showed, so nothing jumps: the panel's wall and place
  // too, entered as they are
  const setAuto = (patch: Partial<AutoFlags>): void => {
    // (the panel's switch works before anything is worked out: entered, its wall and place are to enter)
    if (!derived && !('panel' in patch)) return;
    const pick = derived?.analysis.sizing.pick ?? null;
    const ids: Readonly<Record<Exclude<keyof AutoFlags, 'panel'>, readonly string[]>> = {
      P: ['P'], L0: ['L0'], dx: ['dx'], Hv: ['Hv'], machine: derived?.origin.machine === 'auto' && pick ? Object.keys(proposalValues(pick)) : [],
    };
    const seed: Record<string, string | number | boolean> = {};
    for (const k of Object.keys(patch) as (keyof AutoFlags)[]) {
      if (patch[k] !== false || k === 'panel' || !derived) continue;
      for (const id of ids[k]) {
        const v = derived.values[id];
        if (v !== undefined) seed[id] = v;
      }
    }
    const placed = patch.panel === false && derived?.origin.panel === 'auto' ? derived.shaft.room : null;
    setForm((f) => {
      const next = { ...f, inputs: { ...f.inputs, auto: { ...f.inputs.auto, ...patch }, calc: mirrorRopes({ ...f.inputs.calc, ...seed }) } };
      return placed ? panelEntered(next, placed) : next;
    });
    setSaveError(null);
  };
  const setSize = (key: 'W' | 'D', value: number): void => {
    setShaft({ [key]: value });
    setSource(null);
  };
  // the shaft measured on a drawing: the car and what stands round it follow its size, as with the fields
  const onSurvey = (r: SurveyResult): void => {
    setShaft({ W: r.W, D: r.D });
    setSource(r.source);
  };
  // the save sends what the form holds: only once what is shown has caught up with it, with nothing left to enter
  const settled = deferred === form;
  const save = (): void => {
    if (!settled || missingOf(form).length || existingMissing(form.inputs.calc).length) return;
    setSaveError(null);
    draftHandle.stop();
    startSaving(async () => {
      const r = await saveLiftDesignAction({ projectId, inputs: inp, source, label });
      if (r.ok) router.push(`/app/lift-designs/${r.id}`);
      else setSaveError(`${te(r.error)}${r.fields?.length ? `: ${[...new Set(r.fields.map(nameOf))].join(', ')}` : ''}`);
    });
  };
  const items = (keys: readonly string[]) => missingItems(keys, dInp.shaft.vertical.floors, { shaft: (k, v) => ts(k, v), blank: (k, v) => tb(k, v), lift: (k, v) => t(k, v), calc: nameOf });
  const above = derived?.values.layout !== 'bottom', toEnter = derived ? machineMissing : missing;
  return (
    <div className="lift-work">
      <LiftForm P={P} X={X} inp={inp} derived={derived} complete={complete} blank={blank} bad={bad} need={need} texts={texts} source={source} setShaft={setShaft} setSize={setSize}
        onSurvey={onSurvey} setCalc={setCalc} setAuto={setAuto} setBottom={setBottom} setCollaudo={setCollaudo} setCatalog={setCatalog} />
      <div className="lift-main">
        {!derived ? <MissingPanel title={tb('title')} lead={tb('lead')} items={items(missing)} /> : (
          <>
            {complete ? <LiftFacts derived={derived} X={X} fmt={P.fmt} />
              : <MissingPanel id="missing-machine" title={tb('machineTitle')} lead={tb('machineLead')} items={items(machineMissing)} />}
            <MachineAdvice evaluate={evaluate} alternative={alternative} fmt={P.fmt} inUse={machineInUse} onUse={takeMachine} where="design" />
            {complete ? (
              <>
                <LiftSimulator derived={derived} fmt={P.fmt} api={sim} />
                <section className="panel"><PlanEditor I={drawn} onChange={setDrawn} machine={above ? derived.machine : null} onCalc={setCalcFromDrawing} id="lift-plan"
                  below={derived.bottom ? { machine: derived.machine, analysis: derived.analysis, scheme: derived.bottom } : null} /></section>
                <LiftChecks derived={derived} X={X} fmt={P.fmt} onSimulate={(req) => sim.current?.play(req)} />
                <PanevBom L={derived.layout} prices={prices} />
              </>
            ) : null}
          </>
        )}
      </div>
      <div className="savebar">
        <div className="inner">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={t('label')} aria-label={t('label')} />
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !complete || !settled || refused.length > 0}>{saving ? t('saving') : t('save')}</button>
          <span className={complete && refused.length ? 'note bad' : 'note'}>
            {!complete ? tb('saveMissing', { n: toEnter.length }) : refused.length ? t('fix_list', { list: refused.join(', ') }) : t('save_hint')}
          </span>
          {saveError ? <span className="note bad" role="alert">{saveError}</span> : null}
          {draft ? <DraftBar target={draft} draft={draftHandle} /> : null}
        </div>
      </div>
    </div>
  );
}
