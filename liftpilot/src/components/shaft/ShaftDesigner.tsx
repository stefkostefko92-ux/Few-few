'use client';

// The shaft designer of an installation: the survey (on a CAD drawing or by hand), the choices, the live proposal
// with its plan and checks, and the save that sends the inputs to the server, which lays the shaft out again and
// stores the official record.
import { useCallback, useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import type { ShaftSource } from '@/lib/shaft-input';
import { saveShaftDesignAction } from '@/server/shaft-actions';
import { keptPlan, layout, type ShaftInputs } from '@/shaft';
import HeadOptions from './HeadOptions';
import ImbottiOptions from './ImbottiOptions';
import NicheOptions from './NicheOptions';
import RoomOptions from './RoomOptions';
import ShaftOptions from './ShaftOptions';
import PlanEditor from './PlanEditor';
import VerticalOptions from './VerticalOptions';
import ShaftResults from './ShaftResults';
import PanevBom from './PanevBom';
import SurveyPanel, { type SurveyResult } from './SurveyPanel';

interface Props {
  projectId: string;
  initial: ShaftInputs;
}

export default function ShaftDesigner({ projectId, initial }: Props) {
  const t = useTranslations('shaft'), te = useTranslations('errors'), locale = useLocale();
  const router = useRouter();
  const fmt = useMemo(() => makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']), [locale]);
  const [I, setI] = useState<ShaftInputs>(initial);
  const [source, setSource] = useState<ShaftSource | null>(null);
  const [mode, setMode] = useState<'cad' | 'hand'>('cad');
  const [lastQ, setLastQ] = useState(initial.Q ?? 630);
  const [label, setLabel] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const set = (patch: Partial<ShaftInputs>): void => {
    if (typeof patch.Q === 'number') setLastQ(patch.Q);
    // the distances set by hand go with the arrangement they belong to
    setI((prev) => {
      const next = { ...prev, ...patch };
      return { ...next, plan: keptPlan(prev, next) };
    });
    setSaveError(null);
  };
  const setSize = (key: 'W' | 'D', value: string): void => {
    const v = Math.round(Number(value.replace(',', '.')));
    if (!Number.isFinite(v)) return;
    set({ [key]: v });
    setSource(null); // typed in: no longer the measure on the drawing
  };
  // the shaft measured on a drawing: the car and what stands round it follow its size, as with the fields
  const onSurvey = useCallback((r: SurveyResult): void => {
    setI((prev) => {
      const next = { ...prev, W: r.W, D: r.D };
      return { ...next, plan: keptPlan(prev, next) };
    });
    setSource(r.source);
    setSaveError(null);
  }, []);

  const L = useMemo(() => layout(I), [I]);
  const valid = I.W >= 500 && I.W <= 10000 && I.D >= 500 && I.D <= 10000;

  const save = (): void => {
    setSaveError(null);
    startSaving(async () => {
      const r = await saveShaftDesignAction({ projectId, inputs: I, source, label });
      if (r.ok) router.push(`/app/shaft-designs/${r.id}`);
      else setSaveError(te(r.error));
    });
  };

  return (
    <div className="shaft">
      <div className="shaft-layout">
        <section className="panel shaft-input">
          <h2>{t('step1')}</h2>
          <div className="seg-row" role="radiogroup" aria-label={t('step1')}>
            {(['cad', 'hand'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : undefined} onClick={() => setMode(m)}>
                {t(m === 'cad' ? 'fromCad' : 'byHand')}
              </button>
            ))}
          </div>
          <div hidden={mode !== 'cad'}><SurveyPanel onSurvey={onSurvey} /></div>
          <div className="form-grid">
            <label className="field">
              <span>{t('W')}</span>
              <input className="input num" type="number" inputMode="numeric" min={500} max={10000} step={10} value={I.W} onChange={(e) => setSize('W', e.target.value)} />
            </label>
            <label className="field">
              <span>{t('D')}</span>
              <input className="input num" type="number" inputMode="numeric" min={500} max={10000} step={10} value={I.D} onChange={(e) => setSize('D', e.target.value)} />
            </label>
          </div>
          <p className="note">{source ? t('sourceCad', { file: source.file, format: source.format.toUpperCase() }) : t('edited')}</p>
          <h2>{t('step2')}</h2>
          <ShaftOptions I={I} set={set} lastQ={lastQ} />
          <NicheOptions I={I} set={set} />
          <HeadOptions I={I} set={set} />
          <ImbottiOptions I={I} set={set} />
          <VerticalOptions I={I} set={set} />
          <RoomOptions I={I} set={set} />
        </section>
        <section className="panel shaft-output" aria-live="polite">
          <h2>{t('result')}</h2>
          <PlanEditor I={I} onChange={set} machine={null} id="live" titleAs="h3" />
          <ShaftResults L={L} texts={{ t: (k, v) => t(k, v), fmt }} />
          <PanevBom L={L} fmt={fmt} framed={false} />
          <p className="note">{t('limits')}</p>
        </section>
      </div>
      <div className="savebar">
        <div className="inner">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={t('label')} aria-label={t('label')} />
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !valid}>{saving ? t('saving') : t('save')}</button>
          <span className="note">{t('saveHint')}</span>
          {saveError ? <span className="note bad" role="alert">{saveError}</span> : null}
        </div>
      </div>
    </div>
  );
}
