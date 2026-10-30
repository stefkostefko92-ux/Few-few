'use client';

// The Progetto in one screen (round 45): the drawing's form on the left (ProgettoForm), everything the software works out
// and the 3D simulation on the right, live; every check with a button that replays it; the save. The drawing holds the
// geometry only (ProgettoInputs); the browser composes it on its «Calcolo argano» (liftInputsOf: the rated load, speed,
// machine, ropes, roping, machine's place and test are the calculation's) to draw and check it, as the server does when
// it saves — the server never takes the calculation from the browser. A new drawing starts empty: until its data are in
// the right side lists what is still to enter and nothing is worked out or drawn. Its draft is kept as it is filled in.
// What the drawing completes of the calculation is set beside it (DifferenzeCalcolo); «Porta nel calcolo» keeps the
// draft at once and opens the calculation with the drawing's values (?dal=progetto), for whoever makes it. Round 50: the
// installation's survey sketches head the right side (SchizzoPanel); what is confirmed from one enters the form as if
// typed (src/lib/schizzi/applica.ts) — a new size of the shaft drops the CAD measure, as typing it does. Round 52: the bar
// of the steps over both sides, the step now in the save bar (components/passi). Round 53: the right side holds the
// drawing and the checks in two tabs (ProgettoRisultati); a check's «Simula» keeps the draft, then opens the Simulazione
// of the draft on that check; the 3D and the bill are the Simulazione's and «Tavole e documenti»'s (the standalone page
// keeps them here, `completo`); in «Semplice» the form shows one step at a time (progetto-uno.ts).
import { useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition, type Ref } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import type { Edit } from '@/drawing';
import { deriveLift, tipoDaRivedere, type BottomScheme, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { bottomTo, isBlankKey, type BlankKey, type LiftDraft } from '@/lib/lift/blank';
import { mancantiDi } from '@/lib/lift/progetto-bozza';
import { composto, type ProgettoAuto, type ProgettoDraft } from '@/lib/lift/progetto';
import { conModifica, conPatch, conVano } from '@/lib/lift/progetto-edit';
import { calataVerso, calateEsistenti } from '@/lib/lift/calata';
import { macchinaEsistente } from '@/lib/lift/kept';
import { drawnShaft, edited, panelEntered } from '@/lib/lift/panel-form';
import { withPitches, type BracketPitches } from '@/shaft/brackets';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { liftDraftSchema } from '@/lib/draft-input';
import { bozzaRilievo } from '@/lib/collega/formato';
import { valoreLift } from '@/lib/collega/prefill';
import type { ShaftSource } from '@/lib/shaft-input';
import { editShaft } from '@/lib/shaft-edit';
import { applicaVano, valoreVano } from '@/lib/schizzi/applica';
import { saveLiftDesignAction } from '@/server/lift-actions';
import { editValue, type ShaftInputs } from '@/shaft';
import { testoAiuto } from '@/lib/aiuto';
import { numeriDi, passiProgetto, passoId, type PassoProgetto } from '@/lib/passi-moduli';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { asCalcDict } from '../calc/dict';
import MissingPanel, { goToField } from '../MissingPanel';
import RefreshNotice from '../RefreshNotice';
import { fieldId, type ShaftSet } from '../blank';
import DraftBar from '../draft/DraftBar';
import BarraPassi, { PassoOra } from '../passi/BarraPassi';
import { useDraft, type DraftTarget } from '../draft/useDraft';
import { OrigineProvider, type OrigineRilievo } from '../collega/origine';
import PanevBom from '../shaft/PanevBom';
import PlanEditor from '../shaft/PlanEditor';
import { ConAiuto } from '../shaft/Campo';
import type { Modulo } from '../schizzi/ConfermaValori';
import SchizzoPanel, { type SchizziStart } from '../schizzi/SchizzoPanel';
import type { Refusal } from '../drawing/EditableDrawing';
import type { SurveyResult } from '../shaft/SurveyPanel';
import type { BaseProgetto } from './DalCalcolo';
import LiftFacts from './LiftFacts';
import LiftChecks from './LiftChecks';
import LiftSimulator, { type SimApi, type SimRequest } from './LiftSimulator';
import DifferenzeCalcolo from './DifferenzeCalcolo';
import ProgettoForm from './ProgettoForm';
import ProgettoRisultati from './ProgettoRisultati';
import { useUnoAllaVolta } from './progetto-uno';
import { missingItems } from './missing-items';
import { useSaveBlockers } from './save-blockers';
import { useRimediProgetto } from './rimedi-progetto';

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
  /** the installation's survey sketches beside the form (round 50); absent: none shown (the standalone page) */
  schizzi?: SchizziStart | null;
  /** the standalone page: the 3D and the bill beside the drawing, as before round 53 */
  completo?: boolean;
}

/** The largest height of the diverting pulley under the sheave a drawing may set [mm]. */
const CALC_H_MAX = 3000;

export interface WorkspaceApi {
  /** a dimension of the drawings given a new length: null when applied, else why not */
  edit(e: Edit, length: number): Refusal | null;
}

export default function ProgettoWorkspace({ projectId, base, when, canCalc, initial, onDerived, api, prices, pitches, draft = null, refresh = false, origine = null, schizzi = null, completo = false }: Props) {
  const locale = useLocale(), messages = useMessages(), t = useTranslations('lift'), ts = useTranslations('shaft'), te = useTranslations('errors'), tb = useTranslations('blank');
  const tpa = useTranslations('passi');
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
  const missing = useMemo((): BlankKey[] => mancantiDi(deferred, base.collaudo), [deferred, base.collaudo]);
  const car = pitches?.car, cw = pitches?.cw;
  const derived = useMemo(() => {
    if (missing.length) return null;
    const d = deriveLift(dInp);
    return { ...d, layout: withPitches(d.layout, { car, cw }) };
  }, [missing, dInp, car, cw]);
  // what the save would refuse, as the server refuses it, named as the form names it (save-blockers.ts)
  const { nameOf, blockers, refused } = useSaveBlockers(P, derived, dInp.shaft);
  // a «Solo argano» base whose test the drawn travel changes (round 46): the type to review in the calculation
  const rivedere = !!derived && tipoDaRivedere(base.tipo, derived.collaudo);
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
  // a check's «Simula»: the draft kept, then the Simulazione of the draft on that check
  const simula = projectId ? (id: string) => `/app/projects/${projectId}/simulazione?fonte=bozza&verifica=${id}` : undefined;
  const apriSim = (href: string): void => startLeaving(async () => {
    await draftHandle.flush();
    router.push(href);
  });
  const texts = { choose: tb('choose'), std: tb('std'), stdTitle: tb('stdTitle') };

  // a change the one form's helpers make on the composed draft, kept as the drawing (the plan's h as it was); the change
  // that completes it on existing falls puts the plan's drop at them (round 46, src/lib/lift/calata.ts)
  const change = (f: (L: LiftDraft) => LiftDraft): void => {
    setForm((d) => conModifica(d, B, f));
    setSaveError(null);
  };
  // the distances set by hand go with the arrangement they belong to; what the patch sets is entered (progetto-edit.ts)
  const setShaft: ShaftSet = (patch, edit) => {
    setForm((d) => conPatch(d, B, patch, edit));
    setSaveError(null);
  };
  // the drawings show the panel where the software put it and the HEB beams it took; moved or chosen there, entered
  const drawn = useMemo(() => drawnShaft(inp.shaft, derived), [inp.shaft, derived]);
  const setDrawn = (next: ShaftInputs): void => {
    setForm((d) => conVano(d, B, next, derived));
    setSaveError(null);
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
  // the existing falls a direct pull keeps — or the sheave of the machine the intervention keeps (round 46 review): the
  // plan's drop set to them with one click beside the hint
  const Do = useMemo(() => calateEsistenti(base.values), [base.values]);
  const keptD = Do === null && derived && macchinaEsistente(inp) ? derived.analysis.ctx.N.D : null;
  const verso = (at: number) => (): void => {
    const to = derived ? calataVerso(drawn, derived, at) : null, r = to && derived ? editShaft(edited(drawn, to.e, derived), to.e, to.length) : null;
    if (r?.ok) setDrawn(r.inputs);
  };
  const calate = Do !== null ? { Do, fix: verso(Do) } : keptD !== null ? { Do: keptD, fix: verso(keptD), kept: true } : null;
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
  // the measures confirmed from a sketch, into the drawing as typed (the CAD measure dropped with a new size)
  const modulo: Modulo = {
    attuale: (id) => valoreVano(composed, id),
    applica: (valori) => {
      const r = applicaVano(composed, valori);
      if (r.applied.length) {
        change(() => r.draft);
        if (r.applied.includes('W') || r.applied.includes('D')) setSource(null);
      }
      return { applied: r.applied, refused: r.refused };
    },
    // the stops by the names the form gives them (the main stop stays an index from the bottom)
    fermata: (i) => composed.inputs.shaft.vertical.floors[i]?.label ?? String(i),
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
  // the steps (round 52): the room is one when the form shows it — the machine room above, the pulley room of scheme room
  const sotto = inp.calc.layout === 'bottom', pulegge = sotto && !form.blank.includes('bottom') && inp.bottom === 'room';
  const titoli: Record<PassoProgetto, string> = {
    base: tpa('base'), vano: t('s_shaft'), piani: t('s_floors'), locale: ts(pulegge ? 'rm_pulley_title' : 'rm_title'), funi: t('s_funi'), verifiche: tpa('verifiche'),
  };
  const passi = passiProgetto(missing, { locale: !sotto || pulegge }, (k) => titoli[k], (k) => (isBlankKey(k) ? fieldId(k) : k));
  const numeri = numeriDi<PassoProgetto>(passi), uno = useUnoAllaVolta(passi);
  const rimedi = useRimediProgetto({ form, base: B, derived, pitches, settled, applica: setDrawn, calcolo: porta });
  return (
    <OrigineProvider value={origine}>
    <div className="lift-work">
      {refresh ? <RefreshNotice kind="lift" items={[...items(missing), ...blockers]} /> : null}
      <BarraPassi passi={passi} label={tpa('progetto')} attivo={uno?.attivo} />
      <ProgettoForm P={P} X={X} inp={inp} base={base} projectId={projectId} when={when} canCalc={canCalc} h={form.progetto.h} derived={derived} blank={blank}
        texts={texts} source={source} setShaft={setShaft} setSize={setSize} onSurvey={onSurvey} setAuto={setAuto} setBottom={setBottom}
        porta={porta ? { go: porta, pending: leaving } : null} calate={calate} numeri={numeri} uno={uno} />
      <div className="lift-main passo-sez" id={passoId('verifiche')}>
        {schizzi ? <SchizzoPanel start={schizzi} target="vano" modulo={modulo} open={initial.blank.length > 0 || schizzi.initial.length > 0} /> : null}
        {!derived ? <MissingPanel title={tb('title')} lead={tb('lead')} items={items(missing)} /> : (
          <ProgettoRisultati derived={derived} fatti={<LiftFacts derived={derived} X={X} fmt={P.fmt} />}
            differenze={<DifferenzeCalcolo P={P} X={X} base={base.values} derived={derived} porta={porta} pending={leaving} collaudo={base.collaudo} tipo={base.tipo} />}
            disegno={<section className="panel"><PlanEditor I={drawn} onChange={setDrawn} machine={above ? derived.machine : null} onCalc={setCalcFromDrawing} id="lift-plan"
              below={derived.bottom ? { machine: derived.machine, analysis: derived.analysis, scheme: derived.bottom } : null} /></section>}
            verifiche={<LiftChecks derived={derived} X={X} fmt={P.fmt} {...(completo ? { onSimulate: (req: SimRequest) => sim.current?.play(req) } : { simulaHref: simula, apri: apriSim, rimedi })} />}
            completo={completo ? { simulatore: <LiftSimulator derived={derived} fmt={P.fmt} api={sim} />, distinta: <PanevBom L={derived.layout} prices={prices} C={derived.collaudo} /> } : null} />
        )}
      </div>
      <div className="savebar">
        <div className="inner">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={t('label')} aria-label={t('label')} />
          <ConAiuto aiuto={testoAiuto(AIUTO, 'label')} nome={t('label')} />
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !derived || !settled || refused.length > 0 || rivedere}>{saving ? t('saving') : t('save')}</button>
          <span className={derived && refused.length ? 'note bad' : 'note'}>
            {/* what to correct, each a link to where it is corrected (round 46: the falls by the plan's dimension) */}
            {!derived ? <>{tb('saveMissing', { n: missing.length })} <PassoOra passi={passi} /></> : rivedere ? te('tipoDaRivedere') : refused.length ? <>{t('fix_list_lead')} {blockers.map((b, i) => (
              <span key={`${b.id ?? ''}${b.label}`}>{i ? ', ' : ''}{b.id ? <a href={`#${b.id}`} onClick={(e) => { e.preventDefault(); if (b.id) goToField(b.id); }}>{b.label}</a> : b.label}</span>
            ))}.</> : t('save_hint')}
          </span>
          {saveError ? <span className="note bad" role="alert">{saveError}</span> : null}
          {draft ? <DraftBar target={draft} draft={draftHandle} /> : null}
        </div>
      </div>
    </div>
    </OrigineProvider>
  );
}
