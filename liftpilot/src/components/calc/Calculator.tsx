'use client';

// «Calcolo argano» (round 45): the type of intervention first — «Solo argano», «Ammodernamento», «Trasformazione
// completa» — with the parts answered and the warnings of the type, then the form, live results from src/calc in the
// browser (preview), the standards of the acceptance test, and the save that sends the values, the type and the test to
// the server, which recomputes and stores the official snapshot (the type and the test beside it). A new calculation
// starts empty (src/lib/calc-blank.ts): the type and the values still to enter are listed, the proposals and the advice
// come once the installation is entered, the verdict once the new machine is too; a modernisation that keeps the machine
// verifies it as it is, with no proposal or advice; the form's draft is kept as it is filled in. Round 54: each check the
// verdict counts with its remedies under it (RimediCalcolo).
import { useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { PRESETS } from '@/calc/presets';
import { ropeFamily } from '@/calc/sizing';
import type { FormValues } from '@/calc/types';
import { analyse, mirrorRopes, proposalValues, sizingWithSheave } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import { makePres, type CalcKey } from '@/lib/present/tr';
import { visibleBad } from '@/lib/calc-input';
import { REGOLAZIONE_ID, calcMissing, plantReady } from '@/lib/calc-blank';
import { savedValues } from '@/lib/calc-saved';
import { segniResta } from '@/lib/calc-resta';
import { calcDraftSchema } from '@/lib/draft-input';
import { bozzaRilievo } from '@/lib/collega/formato';
import { collaudoOf, interventoDi, interventoTo, type Collaudo, type Parte, type TipoIntervento } from '@/lib/lift';
import { calcExtra } from '@/lib/lift/calc-verdict';
import { funeDi } from '@/lib/rt2/cataloghi/funi';
import { esempioCollaudo, esitoParte, partiDi } from '@/lib/lift/risposte';
import { numeriDi, passiCalcolo, passoId, type PassoCalcolo } from '@/lib/passi-moduli';
import MissingPanel from '@/components/MissingPanel';
import BarraPassi from '@/components/passi/BarraPassi';
import { useDraft, type DraftTarget } from '@/components/draft/useDraft';
import { saveCalculationAction } from '@/server/calc-actions';
import { valuesCandidate, valuesWall, type AdviceModel, type MachineCandidate } from '@/lib/lift/advice';
import CollaudoOptions from '@/components/lift/CollaudoOptions';
import MachineAdvice from '@/components/lift/MachineAdvice';
import { asCalcDict } from './dict';
import CalcForm, { type Prefix } from './CalcForm';
import CalcSaveBar from './CalcSaveBar';
import Diagram from './Diagram';
import Verdict from './Verdict';
import RimediCalcolo from './RimediCalcolo';
import Results, { type UseKey } from './Results';
import LegalNotice from './LegalNotice';
import InterventoChoice from './InterventoChoice';
import PartiSiNo from './PartiSiNo';
import { mancaParte } from './etichette-parti';
import AvvisiIntervento from './AvvisiIntervento';
import { useIntervento, type InterventoInit } from './useIntervento';
import { ModoSwitch, useModo } from './ModoCalc';
import { SERVICE } from './fields';
import { OrigineProvider, type OrigineRilievo } from '../collega/origine';

type PresetKey = 'A' | 'B' | 'C';
const num = (V: FormValues, id: string): number => { const x = parseFloat(String(V[id] ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
/** A value of the form as the calculation reads it: the same number however it was typed. */
const sameValue = (a: FormValues[string], b: FormValues[string]): boolean => {
  const n = (x: FormValues[string]): number => (typeof x === 'number' ? x : typeof x === 'string' ? parseFloat(x.replace(',', '.')) : NaN);
  return String(a) === String(b) || (Number.isFinite(n(a)) && n(a) === n(b));
};
const MODE = { SOLO_ARGANO: 'solo', AMMODERNAMENTO: 'ammodernamento', TRASFORMAZIONE_COMPLETA: 'trasformazione' } as const;

/** The type a start carries: the one given; an example's by its shape, every part of it answered; else none. */
function startOf(initial: FormValues, preset: PresetKey | null, given: InterventoInit | undefined): InterventoInit {
  if (given) return given;
  if (!preset) return { tipo: null, collaudo: null, risposte: [] };
  const tipo = interventoDi(initial.context, null);
  return { tipo, collaudo: esempioCollaudo(tipo, interventoTo(tipo).collaudo), risposte: partiDi(tipo) };
}

interface Props {
  projectId: string;
  initial: FormValues;
  /** example loaded at start (a new calculation), null when continuing from a saved one */
  preset: PresetKey | null;
  brand: string;
  /** the type of intervention, its test and the parts answered of the calculation it starts from (absent: none chosen,
   *  or the example's) */
  intervento?: InterventoInit;
  /** where the form's draft is kept; absent: none (the standalone page) */
  draft?: DraftTarget | null;
  /** the installation's survey the values «dal rilievo» come from (round 44), the drawing those «dal progetto» come from */
  origine?: OrigineRilievo | null;
  /** the values, test and type as they settle with nothing missing (the standalone page draws its Progetto on them) */
  onBase?(base: { values: FormValues; collaudo: Collaudo; tipo: TipoIntervento }): void;
  /** the sheave a drawing's direct pull hangs its falls from [mm] (round 45, ?dal=progetto): the proposals take only it
   *  while the machine stays above with a direct pull; null: none */
  sheave?: number | null;
}

export default function Calculator({ projectId, initial, preset: initialPreset, brand, intervento, draft = null, origine = null, onBase, sheave = null }: Props) {
  const locale = useLocale(), messages = useMessages(), tc = useTranslations('calculations'), te = useTranslations('errors'), tb = useTranslations('blank');
  const ti = useTranslations('calculations.intervento'), tl = useTranslations('lift'), tpa = useTranslations('passi');
  const router = useRouter();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const { t } = P;

  const [values, setValues] = useState<FormValues>(() => mirrorRopes(initial));
  // the workspace's mode (round 52, kept with the user); the standalone artifact has none and keeps one of its own
  const [mode, setMode] = useModo();
  const [preset, setPreset] = useState<PresetKey | null>(initialPreset);
  const [propMsg, setPropMsg] = useState('');
  const [estMsg, setEstMsg] = useState<Partial<Record<Prefix, string>>>({});
  const [label, setLabel] = useState('');
  const [saveError, setSaveError] = useState<{ error: string; fields: string[] } | null>(null);
  const [saving, startSaving] = useTransition();

  const edit = (patch: FormValues): void => {
    setValues((V) => mirrorRopes({ ...V, ...patch }));
    setPreset(null);
    setPropMsg('');
    setSaveError(null);
  };
  const I = useIntervento(startOf(initial, initialPreset, intervento), values, edit);
  // the machine kept once «Argano: No» is answered (src/lib/lift/intervento.ts macchinaResta)
  const { tipo, value: collaudo } = I, resta = I.resta && I.risposte.includes('machine');
  // the machine kept is the existing one: the survey's marks of the existing machine on its fields (round 46)
  const vista = useMemo(() => (resta && origine ? { ...origine, valori: segniResta(origine.valori) } : origine), [resta, origine]);

  const deferred = useDeferredValue(values);
  // the calculation as it will be saved (round 46): the fields out of view at the value the engine reads in their place
  // (src/lib/calc-saved.ts), the form keeping what was typed in them
  const saved = useMemo(() => savedValues(deferred), [deferred]);
  const analysed = useMemo(() => analyse(saved), [saved]);
  // a drawing's direct pull (?dal=progetto): the proposals of the sheave its falls hang from only (shown, not saved)
  const held = sheave && deferred.layout === 'top' ? sheave : null;
  const a = useMemo(() => (held ? { ...analysed, sizing: sizingWithSheave(analysed.ctx, held), hold: 'drop' as const } : analysed), [analysed, held]);
  const evaluate = useCallback((m: AdviceModel) => valuesCandidate(saved, a, m), [saved, a]);
  // D.1 and D.2 with the ratio of the loads changed, counted in the result as the save counts them: on the values and
  // the test as they are sent (save.ts: collaudoOf of the saved values and the test chosen)
  const extra = useMemo(() => calcExtra(collaudoOf(saved, I.effective), saved), [saved, I.effective]);
  // the type and the parts still to answer first; the values still to enter are needed, not wrong: marked apart from
  // the ones out of range
  const missing = useMemo(() => calcMissing(deferred, a.ctx.bad, tipo, I.mancanti, I.mancaRegolazione), [a, deferred, tipo, I.mancanti, I.mancaRegolazione]);
  const need = useMemo(() => new Set(missing), [missing]);
  const ready = plantReady(missing), complete = missing.length === 0;
  useEffect(() => { if (complete && tipo) onBase?.({ values: saved, collaudo, tipo }); }, [complete, tipo, saved, collaudo, onBase]);
  const bad = useMemo(() => new Set(visibleBad(a.ctx.bad, deferred).filter((id) => !need.has(id))), [a, deferred, need]);
  const texts = { choose: tb('choose'), std: tb('std'), stdTitle: tb('stdTitle'), stdInUse: (list: string) => tb('stdInUse', { list }) };
  // the draft keeps the type, the parts answered and which values came from the survey (and whether the form started
  // from it), so that their marks come back with it
  const draftData = { values, collaudo: I.chosen ?? null, ...(tipo ? { intervento: tipo } : {}), risposte: I.risposte, ...bozzaRilievo(vista, (id) => values[id]) };
  const draftHandle = useDraft(draft, draftData, calcDraftSchema.safeParse(draftData).success);

  // the rope of the model's lists fills its diameter, breaking load and mass; editing one of them by hand leaves the list
  const set = (id: string, v: string | boolean): void => {
    const f = id === 'n_cat' ? funeDi(v) : null;
    if (f) edit({ n_cat: f.id, n_d: String(f.d), n_Fmin: String(f.MBL / 1000), n_qf: String(f.q) });
    else if ((id === 'n_d' || id === 'n_Fmin' || id === 'n_qf') && values.n_cat) edit({ [id]: v, n_cat: '' });
    else edit({ [id]: v });
  };
  const loadPreset = (k: PresetKey): void => {
    setValues(mirrorRopes(PRESETS[k]));
    I.esempio(PRESETS[k]);
    setPreset(k);
    setPropMsg('');
    setEstMsg({});
    setSaveError(null);
  };
  // fills breaking load and mass from the diameter (typical 8×19 Seale 1570 N/mm², marked as an estimate)
  const onEstimate = (p: Prefix): void => {
    const d = num(values, p + 'd');
    if (!(d > 0)) return;
    const rope = ropeFamily(d);
    edit({ [p + 'Fmin']: rope.Fmin, [p + 'qf']: rope.qf });
    setEstMsg((m) => ({ ...m, [p]: t('est_rope_done') }));
  };
  // loads a proposal into the new-machine fields; poles, speed, η_d, inertias and mass stay as entered
  const onUse = (key: UseKey): void => {
    const o = key === 'pick' ? a.sizing.pick : a.sizing.options[key];
    if (!o) return;
    edit(proposalValues(o));
    setPropMsg(t('p_applied'));
  };
  // the machine of the advice: its sheave, ropes, ratio, static load and mass into the new machine's fields
  const takeMachine = (c: MachineCandidate): void => {
    edit(c.values);
    setPropMsg(t('p_applied'));
  };
  const machineInUse = (c: MachineCandidate): boolean => Object.entries(c.values).every(([k, v]) => sameValue(values[k], v));
  const save = (): void => {
    setSaveError(null);
    draftHandle.stop();
    startSaving(async () => {
      const r = await saveCalculationAction({ projectId, values: savedValues(values), label, collaudo: I.effective ?? null, intervento: tipo });
      if (r.ok) router.push(`/app/calculations/${r.id}`);
      else setSaveError({ error: r.error, fields: r.fields ?? [] });
    });
  };

  const keep = values.context === 'repl' && !!values.keepRopes, mirror = keep && !!values.compare;
  // the hint speaks of the proposal: none while the machine stays
  const keepRopesHint = !keep || resta ? '' : mirror ? t('hint_keepRopes', { n: a.ctx.N.n, d: X.dText(a.ctx.N.d) }) : t('hint_keepRopes_free');
  const fieldLabel = (id: string): string => t((id.replace(/^[no]_/, '') as CalcKey)) + (id.startsWith('o_') ? ` (${t('g_old')})` : '');
  // a change of speed, load or travel still to answer says what is needed (round 47: the document's value or «Sì»/«No»)
  const parteLabel = (p: Parte): string => mancaParte(ti, tl, tipo, p, esitoParte(tipo, collaudo, values, p), collaudo.norma);
  const itemLabel = (id: string): string => (id === 'intervento' ? tb('intervento') : id === REGOLAZIONE_ID ? ti('reg_missing')
    : id.startsWith('parte-') ? parteLabel(id.slice(6) as Parte) : fieldLabel(id));
  const named = (keys: readonly string[]): string => keys.map((k) => ti(`err_${k}`)).join(', ');
  const errorText = saveError
    ? `${te(saveError.error)}${saveError.fields.length ? `: ${saveError.error === 'invalidIntervento' ? named(saveError.fields) : saveError.fields.map(fieldLabel).join(', ')}` : ''}` : null;
  // the existing machine is a modification's; before a type is chosen it stays in view with what is still to enter
  // (a new calculation compares it, as the list of what is missing says)
  const repl = tipo === 'SOLO_ARGANO' || tipo === 'AMMODERNAMENTO';
  // the steps (round 52): the sections in the screen's order, each with what it still needs; the service's group is one
  // in «Esperto» or while a value of it is missing (CalcForm opens it then)
  const funiRestano = resta && !collaudo.parti.includes('ropes');
  const titoli: Record<PassoCalcolo, string> = {
    tipo: ti('title'), collaudo: tpa('collaudo'), impianto: t('g_plant'), disposizione: t('g_layout'), esistente: t('g_old'),
    nuovo: resta ? ti('argano_resta') : t('g_new'), funi: funiRestano ? ti('funi_restano') : t('g_ropes'), funi10411: t('g_funi10411'), servizio: t('g_service'), esito: tpa('esito'),
  };
  const servizio = mode === 'expert' || SERVICE.some((f) => need.has(f.id) || bad.has(f.id));
  const passi = passiCalcolo(missing, { tipo: !!tipo, esistente: repl || tipo === null, resta, servizio }, (k) => titoli[k]);
  const numeri = numeriDi<PassoCalcolo>(passi);

  return (
    <OrigineProvider value={vista}>
    <div className={`calc${mode === 'simple' ? ' simple' : ''}`}>
      <div className="calc-top flex flex-wrap items-center justify-between gap-3">
        <div className="controls">
          {(['A', 'B', 'C'] as const).map((k) => <button key={k} type="button" onClick={() => loadPreset(k)}>{t(`ex${k}`)}</button>)}
        </div>
        <ModoSwitch P={P} mode={mode} setMode={setMode} id="mode" />
      </div>
      {preset ? <p className="note" role="status">{t('loaded', { name: t(`ex${preset}name`) })} {tc('replaceExample')}</p> : null}
      <LegalNotice P={P} />
      <BarraPassi passi={passi} label={tpa('calcolo')} />
      <InterventoChoice tipo={tipo} choose={I.choose} passo={numeri.tipo}>
        {repl && I.chosen ? (
          <PartiSiNo tipo={tipo} chosen={I.chosen} value={collaudo} V={values} risposte={I.risposte} answer={I.answer} fmt={P.fmt}
            rifacimento={tipo === 'AMMODERNAMENTO' ? { on: I.rif, set: I.rifacimento } : undefined} regolazione={I.chiedi ? { set: I.regola } : null} />
        ) : null}
        {tipo ? <AvvisiIntervento tipo={tipo} value={collaudo} V={values} passa={I.choose} /> : null}
      </InterventoChoice>
      <div className="layout">
        <CalcForm P={P} V={values} bad={bad} set={set} onEstimate={onEstimate} estMsg={estMsg} keepRopesHint={keepRopesHint} need={need} texts={texts}
          esistente={repl || tipo === null} resta={resta ? { title: ti('argano_resta'), hint: ti('argano_resta_hint'), funi: funiRestano ? ti('funi_restano') : null } : null}
          esperto={mode === 'expert'} numeri={numeri} />
        <section className="summary passo-sez" id={passoId('esito')}>
          {complete ? (
            <>
              <Diagram P={P} I={a.ctx.I} N={a.ctx.N} res={a.res} />
              <Verdict P={P} X={X} a={a} badCount={bad.size} resta={resta ? ti('argano_resta') : undefined} extra={extra} />
              <RimediCalcolo P={P} X={X} values={deferred} collaudo={I.effective ?? null} resta={resta} edit={edit} fieldLabel={fieldLabel} consiglio={!resta} />
            </>
          ) : (
            <MissingPanel title={ready ? tb(resta ? 'keptTitle' : 'machineTitle') : tb('title')} lead={ready ? tb(resta ? 'keptLead' : 'machineLead') : tb('lead')}
              items={missing.map((id) => ({ id, label: itemLabel(id) }))} />
          )}
          {tipo ? <CollaudoOptions P={P} mode={MODE[tipo]} chosen={I.chosen} value={collaudo} set={I.setCollaudo} calc={values} /> : null}
        </section>
        {ready && !resta ? <Results P={P} X={X} a={a} mode={mode} badCount={bad.size} brand={brand} collaudo={collaudo} tipo={tipo} extra={extra} onUse={onUse} propMsg={propMsg}
          proposalOnly={!complete} vincolo={held ? tc('porta.sheave', { D: held }) : undefined} /> : null}
      </div>
      {ready && !resta ? <MachineAdvice evaluate={evaluate} alternative={null} wall={valuesWall(saved)} fmt={P.fmt} inUse={machineInUse} onUse={takeMachine} where="calc" /> : null}
      <CalcSaveBar label={label} setLabel={setLabel} save={save} saving={saving} missing={missing.length} passi={passi}
        bad={[...bad].map(fieldLabel).join(', ')} incoerente={missing.length ? '' : named(I.incoerenze)}
        draft={draft} draftHandle={draftHandle} error={errorText} />
    </div>
    </OrigineProvider>
  );
}
