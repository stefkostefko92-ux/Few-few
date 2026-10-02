'use client';

// The calculator of a project: form, live results from src/calc in the browser (preview), the standards of the
// acceptance test, and the save that sends the values to the server, which recomputes and stores the official
// snapshot (the standards beside it).
import { useDeferredValue, useMemo, useState, useTransition } from 'react';
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
import { saveCalculationAction } from '@/server/calc-actions';
import { collaudoOf, type Collaudo } from '@/lib/lift';
import CollaudoOptions from '@/components/lift/CollaudoOptions';
import { asCalcDict } from './dict';
import CalcForm, { type Prefix } from './CalcForm';
import Diagram from './Diagram';
import Verdict from './Verdict';
import Results, { type UseKey } from './Results';
import LegalNotice from './LegalNotice';

type PresetKey = 'A' | 'B' | 'C';
const num = (V: FormValues, id: string): number => { const x = parseFloat(String(V[id] ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };

interface Props {
  projectId: string;
  initial: FormValues;
  /** example loaded at start (a new calculation), null when continuing from a saved one */
  preset: PresetKey | null;
  brand: string;
  /** shaft design the calculation starts from: the rated load comes from it and the report shows its plan */
  design?: { id: string; Q: number } | null;
  /** the standards of the acceptance test of the calculation it starts from (absent: by the context) */
  collaudo?: Collaudo | null;
}

export default function Calculator({ projectId, initial, preset: initialPreset, brand, design = null, collaudo: initialCollaudo = null }: Props) {
  const locale = useLocale(), messages = useMessages(), tc = useTranslations('calculations'), te = useTranslations('errors');
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
  const bad = useMemo(() => new Set(visibleBad(a.ctx.bad, deferred)), [a, deferred]);
  const anyBad = a.ctx.bad.length > 0;

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
  const save = (): void => {
    setSaveError(null);
    startSaving(async () => {
      const r = await saveCalculationAction({ projectId, values, label, designId: design?.id ?? null, collaudo: collaudo ?? null });
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
      {design ? <p className="note" role="status">{tc('fromDesign', { q: design.Q })}</p> : null}
      <LegalNotice P={P} />
      <div className="layout">
        <CalcForm P={P} V={values} bad={bad} set={set} onEstimate={onEstimate} estMsg={estMsg} keepRopesHint={keepRopesHint} />
        <section className="summary">
          <Diagram P={P} I={a.ctx.I} N={a.ctx.N} res={a.res} />
          <Verdict P={P} X={X} a={a} badCount={bad.size} />
          <CollaudoOptions P={P} isNew={values.context === 'new'} chosen={collaudo} value={collaudoOf(values, collaudo)} set={setCollaudo} />
        </section>
        <Results P={P} X={X} a={a} mode={mode} badCount={bad.size} brand={brand} onUse={onUse} propMsg={propMsg} />
      </div>
      <div className="savebar">
        <div className="inner">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={tc('labelPlaceholder')} aria-label={tc('label')} />
          <button type="button" className="primary" onClick={save} disabled={saving || anyBad}>{saving ? tc('saving') : tc('save')}</button>
          {anyBad ? <span className="note bad">{tc('fixFields', { list: [...new Set(a.ctx.bad)].map(fieldLabel).join(', ') })}</span> : <span className="note">{tc('saveHint')}</span>}
          {saveError ? <span className="note bad" role="alert">{te(saveError.error)}{saveError.fields.length ? `: ${saveError.fields.map(fieldLabel).join(', ')}` : ''}</span> : null}
        </div>
      </div>
    </div>
  );
}
