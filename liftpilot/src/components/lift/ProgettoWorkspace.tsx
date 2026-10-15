'use client';

// The Progetto in one screen (round 45): the drawing's form on the left (ProgettoForm), everything the software works out
// and the 3D simulation on the right, live; every check with a button that replays it; the save. The drawing holds the
// geometry only (ProgettoInputs); the browser composes it on its «Calcolo argano» (liftInputsOf: the rated load, speed,
// machine, ropes, roping, machine's place and test are the calculation's) to draw and check it, as the server does when
// it saves — the server never takes the calculation from the browser. A new drawing starts empty: until its data are in
// the right side lists what is still to enter and nothing is worked out or drawn. Its draft is kept as it is filled in.
// What the drawing completes of the calculation is set beside it (DifferenzeCalcolo); «Porta nel calcolo» keeps the
// draft at once and opens the calculation with the drawing's values (?dal=progetto), for whoever makes it.
import { useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition, type Ref } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import type { Edit } from '@/drawing';
import { deriveLift, type BottomScheme, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { bottomTo, enteredBy, filled, missingOf, type BlankKey, type LiftDraft } from '@/lib/lift/blank';
import { composto, dalComposto, type ProgettoAuto, type ProgettoDraft } from '@/lib/lift/progetto';
import { drawnShaft, edited, enteredShaft, movedPanel, panelEntered } from '@/lib/lift/panel-form';
import { withPitches, type BracketPitches } from '@/shaft/brackets';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { liftDraftSchema } from '@/lib/draft-input';
import { bozzaRilievo } from '@/lib/collega/formato';
import { valoreLift } from '@/lib/collega/prefill';
import type { ShaftSource } from '@/lib/shaft-input';
import { editShaft } from '@/lib/shaft-edit';
import { saveLiftDesignAction } from '@/server/lift-actions';
import { editValue, keptPlan, type ShaftInputs } from '@/shaft';
import { asCalcDict } from '../calc/dict';
import MissingPanel from '../MissingPanel';
import RefreshNotice from '../RefreshNotice';
import type { ShaftSet } from '../blank';
import DraftBar from '../draft/DraftBar';
import { useDraft, type DraftTarget } from '../draft/useDraft';
import { OrigineProvider, type OrigineRilievo } from '../collega/origine';
import PanevBom from '../shaft/PanevBom';
import PlanEditor from '../shaft/PlanEditor';
import type { Refusal } from '../drawing/EditableDrawing';
import type { SurveyResult } from '../shaft/SurveyPanel';
import type { BaseProgetto } from './DalCalcolo';
import LiftFacts from './LiftFacts';
import LiftChecks from './LiftChecks';
import LiftSimulator, { type SimApi } from './LiftSimulator';
import DifferenzeCalcolo from './DifferenzeCalcolo';
import ProgettoForm from './ProgettoForm';
import { missingItems } from './missing-items';
import { useSaveBlockers } from './save-blockers';

interface Props {
  projectId: string;
  /** the «Calcolo argano» the drawing is made on */
  base: BaseProgetto;
  /** the base's date as the page writes it */
  when: string;
  /** whoever makes the calculations: the way to change the base */
  canCalc: boolean;
  /** the drawing to start from and its values still to enter (src/server/progetto-start.ts) */
  initial: ProgettoDraft;
  /** the composed inputs and what they give, each time they settle (the standalone page draws the sheets from them) */
  onDerived?(inputs: LiftInputs, derived: LiftDerived): void;
  /** changes from outside the form: a dimension of the sheets (the standalone page) */
  api?: Ref<WorkspaceApi>;
  /** the company's prices [cents by key] for whoever may see them; null: none shown */
  prices: Readonly<Record<string, number>> | null;
  /** the bracket pitches of the installation's data: the list and the 3D count with them (as sheet 1) */
  pitches?: BracketPitches;
  /** where the drawing's draft is kept; absent: none (the standalone page) */
  draft?: DraftTarget | null;
  /** opened by «Aggiorna con il software attuale» on a record that no longer saves as it was: what to correct, on top */
  refresh?: boolean;
  /** the installation's survey the values «dal rilievo» come from (round 44); absent: none */
  origine?: OrigineRilievo | null;
}

/** The largest height of the diverting pulley under the sheave a drawing may set [mm]. */
const CALC_H_MAX = 3000;

export interface WorkspaceApi {
  /** a dimension of the drawings given a new length: null when applied, else why not */
  edit(e: Edit, length: number): Refusal | null;
}

export default function ProgettoWorkspace({ projectId, base, when, canCalc, initial, onDerived, api, prices, pitches, draft = null, refresh = false, origine = null }: Props) {
  const locale = useLocale(), messages = useMessages(), t = useTranslations('lift'), ts = useTranslations('shaft'), te = useTranslations('errors'), tb = useTranslations('blank');
  const router = useRouter();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const [form, setForm] = useState<ProgettoDraft>(initial);
  const B = useMemo(() => ({ values: base.values, collaudo: base.collaudo }), [base.values, base.collaudo]);
  // the drawing on its base: what the form's helpers, the derivation and the sheets read
  const composed = useMemo(() => composto(form, B), [form, B]), inp = composed.inputs;
  const [source, setSource] = useState<ShaftSource | null>(null);
  const [label, setLabel] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // the drawing and what is still to enter settle together: nothing is drawn from a placeholder; the case of DM 236 is
  // the drawing's to choose when the calculation adds the standard to the test
  const deferred = useDeferredValue(composed), dInp = deferred.inputs;
  const dm236 = !!base.collaudo.aggiuntive?.includes('dm236');
  const missing = useMemo((): BlankKey[] => [...missingOf(deferred),
    ...(dm236 && !deferred.blank.includes('access') && deferred.inputs.shaft.access === 'none' ? ['access' as const] : [])], [deferred, dm236]);
  const car = pitches?.car, cw = pitches?.cw;
  const derived = useMemo(() => {
    if (missing.length) return null;
    const d = deriveLift(dInp);
    return { ...d, layout: withPitches(d.layout, { car, cw }) };
  }, [missing, dInp, car, cw]);
  // what the save would refuse, as the server refuses it, named as the form names it (save-blockers.ts)
  const { nameOf, blockers, refused } = useSaveBlockers(P, derived, dInp.shaft);
  useEffect(() => { if (derived) onDerived?.(dInp, derived); }, [dInp, derived, onDerived]);
  const sim = useRef<SimApi>(null);
  // the draft keeps the drawing, its base and which values came from the survey (and whether the form started from it)
  const draftData = useMemo(() => ({ ...form, base: base.id, ...bozzaRilievo(origine, (id) => valoreLift(form, id)) }), [form, base.id, origine]);
  const draftValid = useMemo(() => liftDraftSchema.safeParse(draftData).success, [draftData]);
  const draftHandle = useDraft(draft, draftData, draftValid);
  const blank = useMemo(() => ({ is: (k: BlankKey) => form.blank.includes(k), list: form.blank, full: derived !== null }), [form.blank, derived]);
  // «Porta nel calcolo»: the drawing kept as the draft the calculation reads, then the calculation on this base
  const [leaving, startLeaving] = useTransition();
  const porta = projectId && canCalc ? (): void => startLeaving(async () => {
    await draftHandle.flush();
    router.push(`/app/projects/${projectId}/calc?from=${base.id}&dal=progetto`);
  }) : null;
  const texts = { choose: tb('choose'), std: tb('std'), stdTitle: tb('stdTitle') };

  // a change the one form's helpers make on the composed draft, kept as the drawing (the plan's h as it was)
  const change = (f: (L: LiftDraft) => LiftDraft): void => {
    setForm((d) => dalComposto(f(composto(d, B)), d.progetto.h));
    setSaveError(null);
  };
  const setShaft: ShaftSet = (patch, edit) => change((L) => {
    // the distances set by hand go with the arrangement they belong to; what the patch sets is entered
    const shaft = { ...L.inputs.shaft, ...patch };
    return { inputs: { ...L.inputs, shaft: { ...shaft, plan: keptPlan(L.inputs.shaft, shaft) } }, blank: filled(edit ? edit(L.blank) : L.blank, enteredBy(patch)) };
  });
  // the drawings show the panel where the software put it and the HEB beams it took; moved or chosen there, entered
  const drawn = useMemo(() => drawnShaft(inp.shaft, derived), [inp.shaft, derived]);
  const setDrawn = (next: ShaftInputs): void => {
    const moved = movedPanel(next, derived);
    if (moved) change((L) => panelEntered(L, moved));
    setShaft(enteredShaft(next, inp.shaft, derived));
  };
  // the diverting pulley's height under the sheave set on the plan [mm] (the drawing's h, effective with dx entered)
  const setCalcFromDrawing = (key: string, value: number): Refusal | null => {
    if (key !== 'calc.h') return { min: null, max: null };
    if (!Number.isFinite(value) || value < 0 || value > CALC_H_MAX) return { min: 0, max: CALC_H_MAX };
    setForm((d) => ({ ...d, progetto: { ...d.progetto, h: value / 1000 } }));
    setSaveError(null);
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
  // (scheme room brings its pulley room: blank.ts bottomTo)
  const setBottom = (bottom: BottomScheme): void => change((L) => bottomTo(L, bottom));
  // a switch of the drawn values; the panel switched to entered stays where the software placed it
  const setAuto = (patch: Partial<ProgettoAuto>): void => {
    const placed = patch.panel === false && derived?.origin.panel === 'auto' ? derived.shaft.room : null;
    change((L) => {
      const next = { ...L, inputs: { ...L.inputs, auto: { ...L.inputs.auto, ...patch } } };
      return placed ? panelEntered(next, placed) : next;
    });
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
  // the save sends the drawing and its base: only once what is shown has caught up with it, with nothing left to enter
  const settled = deferred === composed;
  const save = (): void => {
    if (!settled || missing.length) return;
    setSaveError(null);
    draftHandle.stop();
    startSaving(async () => {
      const r = await saveLiftDesignAction({ projectId, baseCalculationId: base.id, progetto: form.progetto, source, label });
      if (r.ok) router.push(`/app/lift-designs/${r.id}`);
      else setSaveError(`${te(r.error)}${r.fields?.length ? `: ${[...new Set(r.fields.map(nameOf))].join(', ')}` : ''}`);
    });
  };
  const items = (keys: readonly string[]) => missingItems(keys, dInp.shaft.vertical.floors, { shaft: (k, v) => ts(k, v), blank: (k, v) => tb(k, v), lift: (k, v) => t(k, v), calc: nameOf });
  const above = derived?.values.layout !== 'bottom';
  return (
    <OrigineProvider value={origine}>
    <div className="lift-work">
      {refresh ? <RefreshNotice kind="lift" items={[...items(missing), ...blockers]} /> : null}
      <ProgettoForm P={P} X={X} inp={inp} base={base} projectId={projectId} when={when} canCalc={canCalc} h={form.progetto.h} derived={derived} blank={blank}
        texts={texts} source={source} setShaft={setShaft} setSize={setSize} onSurvey={onSurvey} setAuto={setAuto} setBottom={setBottom}
        porta={porta ? { go: porta, pending: leaving } : null} />
      <div className="lift-main">
        {!derived ? <MissingPanel title={tb('title')} lead={tb('lead')} items={items(missing)} /> : (
          <>
            <LiftFacts derived={derived} X={X} fmt={P.fmt} />
            <DifferenzeCalcolo P={P} X={X} base={base.values} derived={derived} porta={porta} pending={leaving} />
            <LiftSimulator derived={derived} fmt={P.fmt} api={sim} />
            <section className="panel"><PlanEditor I={drawn} onChange={setDrawn} machine={above ? derived.machine : null} onCalc={setCalcFromDrawing} id="lift-plan"
              below={derived.bottom ? { machine: derived.machine, analysis: derived.analysis, scheme: derived.bottom } : null} /></section>
            <LiftChecks derived={derived} X={X} fmt={P.fmt} onSimulate={(req) => sim.current?.play(req)} />
            <PanevBom L={derived.layout} prices={prices} C={derived.collaudo} />
          </>
        )}
      </div>
      <div className="savebar">
        <div className="inner">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={t('label')} aria-label={t('label')} />
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !derived || !settled || refused.length > 0}>{saving ? t('saving') : t('save')}</button>
          <span className={derived && refused.length ? 'note bad' : 'note'}>
            {!derived ? tb('saveMissing', { n: missing.length }) : refused.length ? t('fix_list', { list: refused.join(', ') }) : t('save_hint')}
          </span>
          {saveError ? <span className="note bad" role="alert">{saveError}</span> : null}
          {draft ? <DraftBar target={draft} draft={draftHandle} /> : null}
        </div>
      </div>
    </div>
    </OrigineProvider>
  );
}
