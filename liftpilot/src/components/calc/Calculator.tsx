'use client';

// The calculator of a project: form, live results from src/calc in the browser (preview), the standards of the
// acceptance test, and the save that sends the values to the server, which recomputes and stores the official
// snapshot (the standards beside it). A new project's calculator starts empty (src/lib/calc-blank.ts): the values still
// to enter are listed, the proposals and the advice come once the installation is entered, the verdict once the new
// machine is too; the form's draft is kept as it is filled in.
import { useCallback, useDeferredValue, useMemo, useState, useTransition } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { PRESETS } from '@/calc/presets';
import { ropeFamily } from '@/calc/sizing';
import type { FormValues } from '@/calc/types';
import { analyse, mirrorRopes, proposalValues } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import { makePres, type CalcKey } from '@/lib/present/tr';
import { visibleBad } from '@/lib/calc-input';
import { calcMissing, plantReady } from '@/lib/calc-blank';
import { calcDraftSchema } from '@/lib/draft-input';
import MissingPanel from '@/components/MissingPanel';
import DraftBar from '@/components/draft/DraftBar';
import { useDraft, type DraftTarget } from '@/components/draft/useDraft';
import { saveCalculationAction } from '@/server/calc-actions';
import { collaudoOf, type Collaudo } from '@/lib/lift';
import { valuesCandidate, type AdviceModel, type MachineCandidate } from '@/lib/lift/advice';
import CollaudoOptions from '@/components/lift/CollaudoOptions';
import MachineAdvice from '@/components/lift/MachineAdvice';
import { asCalcDict } from './dict';
import CalcForm, { type Prefix } from './CalcForm';
import Diagram from './Diagram';
import Verdict from './Verdict';
import Results, { type UseKey } from './Results';
import LegalNotice from './LegalNotice';

type PresetKey = 'A' | 'B' | 'C';
const num = (V: FormValues, id: string): number => { const x = parseFloat(String(V[id] ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
/** A value of the form as the calculation reads it: the same number however it was typed. */
const sameValue = (a: FormValues[string], b: FormValues[string]): boolean => {
  const n = (x: FormValues[string]): number => (typeof x === 'number' ? x : typeof x === 'string' ? parseFloat(x.replace(',', '.')) : NaN);
  return String(a) === String(b) || (Number.isFinite(n(a)) && n(a) === n(b));
};

interface Props {
  projectId: string;
  initial: FormValues;
  /** example loaded at start (a new calculation), null when continuing from a saved one */
  preset: PresetKey | null;
  brand: string;
  /** the standards of the acceptance test of the calculation it starts from (absent: by the context) */
  collaudo?: Collaudo | null;
  /** where the form's draft is kept; absent: none (the standalone page) */
  draft?: DraftTarget | null;
}

export default function Calculator({ projectId, initial, preset: initialPreset, brand, collaudo: initialCollaudo = null, draft = null }: Props) {
  const locale = useLocale(), messages = useMessages(), tc = useTranslations('calculations'), te = useTranslations('errors'), tb = useTranslations('blank');
  const router = useRouter();
  const P = useMemo(() => makePres(asCalcDict(messages.calc), INTL_LOCALE[isLocale(locale) ? locale : 'it']), [messages.calc, locale]);
  const X = useMemo(() => textsFor(P), [P]);
  const { t } = P;

  const [values, setValues] = useState<FormValues>(() => mirrorRopes(initial));
  const [mode, setMode] = useState<'simple' | 'expert'>('simple');
  const [preset, setPreset] = useState<PresetKey | null>(initialPreset);
  const [propMsg, setPropMsg] = useState('');
  const [estMsg, setEstMsg] = useState<Partial<Record<Prefix, string>>>({});
  const [label, setLabel] = useState('');
  const [saveError, setSaveError] = useState<{ error: string; fields: string[] } | null>(null);
  const [saving, startSaving] = useTransition();
  const [collaudo, setCollaudo] = useState<Collaudo | undefined>(initialCollaudo ?? undefined);

  const deferred = useDeferredValue(values);
  const a = useMemo(() => analyse(deferred), [deferred]);
  const evaluate = useCallback((m: AdviceModel) => valuesCandidate(deferred, a, m), [deferred, a]);
  // the values still to enter are needed, not wrong: marked apart from the ones out of range
  const missing = useMemo(() => calcMissing(deferred, a.ctx.bad), [a, deferred]);
  const need = useMemo(() => new Set(missing), [missing]);
  const ready = plantReady(missing), complete = missing.length === 0;
  const bad = useMemo(() => new Set(visibleBad(a.ctx.bad, deferred).filter((id) => !need.has(id))), [a, deferred, need]);
  const anyBad = a.ctx.bad.length > 0;
  const texts = { choose: tb('choose'), std: tb('std'), stdTitle: tb('stdTitle'), stdInUse: (list: string) => tb('stdInUse', { list }) };
  const draftData = { values, collaudo: collaudo ?? null };
  const draftState = useDraft(draft, draftData, calcDraftSchema.safeParse(draftData).success);

  const edit = (patch: FormValues): void => {
    setValues((V) => mirrorRopes({ ...V, ...patch }));
    setPreset(null);
    setPropMsg('');
    setSaveError(null);
  };
  const set = (id: string, value: string | boolean): void => edit({ [id]: value });
  const loadPreset = (k: PresetKey): void => {
    setValues(mirrorRopes(PRESETS[k]));
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
    startSaving(async () => {
      const r = await saveCalculationAction({ projectId, values, label, collaudo: collaudo ?? null });
      if (r.ok) router.push(`/app/calculations/${r.id}`);
      else setSaveError({ error: r.error, fields: r.fields ?? [] });
    });
  };

  const keep = values.context === 'repl' && !!values.keepRopes, mirror = keep && !!values.compare;
  const keepRopesHint = !keep ? '' : mirror ? t('hint_keepRopes', { n: a.ctx.N.n, d: X.dText(a.ctx.N.d) }) : t('hint_keepRopes_free');
  const fieldLabel = (id: string): string => t((id.replace(/^[no]_/, '') as CalcKey)) + (id.startsWith('o_') ? ` (${t('g_old')})` : '');

  return (
    <div className={`calc${mode === 'simple' ? ' simple' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="controls">
          {(['A', 'B', 'C'] as const).map((k) => <button key={k} type="button" onClick={() => loadPreset(k)}>{t(`ex${k}`)}</button>)}
        </div>
        <div className="seg" role="radiogroup" aria-label={t('aria_mode')}>
          <input type="radio" name="mode" id="mode-simple" checked={mode === 'simple'} onChange={() => setMode('simple')} />
          <label htmlFor="mode-simple">{t('mode_simple')}</label>
          <input type="radio" name="mode" id="mode-expert" checked={mode === 'expert'} onChange={() => setMode('expert')} />
          <label htmlFor="mode-expert">{t('mode_expert')}</label>
        </div>
      </div>
      {preset ? <p className="note" role="status">{t('loaded', { name: t(`ex${preset}name`) })} {tc('replaceExample')}</p> : null}
      <LegalNotice P={P} />
      <div className="layout">
        <CalcForm P={P} V={values} bad={bad} set={set} onEstimate={onEstimate} estMsg={estMsg} keepRopesHint={keepRopesHint} need={need} texts={texts} />
        <section className="summary">
          {complete ? (
            <>
              <Diagram P={P} I={a.ctx.I} N={a.ctx.N} res={a.res} />
              <Verdict P={P} X={X} a={a} badCount={bad.size} />
            </>
          ) : (
            <MissingPanel title={ready ? tb('machineTitle') : tb('title')} lead={ready ? tb('machineLead') : tb('lead')} items={missing.map((id) => ({ id, label: fieldLabel(id) }))} />
          )}
          <CollaudoOptions P={P} isNew={values.context === 'new'} chosen={collaudo} value={collaudoOf(values, collaudo)} set={setCollaudo} />
        </section>
        {ready ? <Results P={P} X={X} a={a} mode={mode} badCount={bad.size} brand={brand} collaudo={collaudoOf(values, collaudo)} onUse={onUse} propMsg={propMsg}
          proposalOnly={!complete} /> : null}
      </div>
      {ready ? <MachineAdvice evaluate={evaluate} alternative={null} fmt={P.fmt} inUse={machineInUse} onUse={takeMachine} where="calc" /> : null}
      <div className="savebar">
        <div className="inner">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={tc('labelPlaceholder')} aria-label={tc('label')} />
          <button type="button" className="primary" onClick={save} disabled={saving || anyBad}>{saving ? tc('saving') : tc('save')}</button>
          {missing.length ? <span className="note">{tb('saveMissing', { n: missing.length })}</span>
            : anyBad ? <span className="note bad">{tc('fixFields', { list: [...new Set(a.ctx.bad)].map(fieldLabel).join(', ') })}</span> : <span className="note">{tc('saveHint')}</span>}
          {draft ? <DraftBar target={draft} state={draftState} /> : null}
          {saveError ? <span className="note bad" role="alert">{te(saveError.error)}{saveError.fields.length ? `: ${saveError.fields.map(fieldLabel).join(', ')}` : ''}</span> : null}
        </div>
      </div>
    </div>
  );
}
