'use client';

// The survey of a replacement's machine room, on the calculation of the new machine: the room (its size, height, slab,
// door, control panel, the support of the machine), the shaft under it and the existing drops as measured. A new
// survey starts empty (src/lib/room/survey.ts): the measures still to enter are listed and nothing is placed until each
// is entered. Then the new machine is placed and checked live with the same code as the save (src/lib/room/derive.ts);
// its drawings change where they are; what stops a record is said with what to do. The form's draft is kept as it is
// filled in. The save sends the survey only: the server derives everything again.
import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import type { FormValues } from '@/calc/types';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { surveyDraftSchema } from '@/lib/draft-input';
import { KL } from '@/lib/lift/norme';
import { makeFmt } from '@/lib/present/tr';
import { deriveRoom, roomCheckKey } from '@/lib/room/derive';
import type { SurveyDraft, SurveyField } from '@/lib/room/survey';
import { isUpperLimit, shownValue } from '@/shaft/checks';
import { saveRoomDesignAction } from '@/server/room-actions';
import MissingPanel from '../MissingPanel';
import { mmOf } from '../blank';
import DraftBar from '../draft/DraftBar';
import { useDraft, type DraftTarget } from '../draft/useDraft';
import RoomFields from '../shaft/RoomFields';
import SurveyDrawings from './SurveyDrawings';
import SurveyFound from './SurveyFound';

interface Props {
  calculationId: string;
  values: FormValues;
  initial: SurveyDraft;
  /** where the form's draft is kept */
  draft?: DraftTarget | null;
}

export default function RoomSurvey({ calculationId, values, initial, draft = null }: Props) {
  const t = useTranslations('room'), ts = useTranslations('shaft'), tb = useTranslations('blank'), te = useTranslations('errors'), locale = useLocale(), router = useRouter();
  const fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  const [form, setForm] = useState<SurveyDraft>(initial);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const s = form.survey, blank = form.blank;
  const complete = blank.length === 0;
  const d = useMemo(() => (complete ? deriveRoom(values, s) : null), [complete, values, s]);
  const draftHandle = useDraft(draft, form, surveyDraftSchema.safeParse(form).success);
  const is = (k: SurveyField): boolean => blank.includes(k);
  // a change of the survey, with the measures it enters
  const change = (survey: SurveyDraft['survey'], entered: readonly SurveyField[]): void =>
    setForm((f) => ({ survey, blank: f.blank.filter((k) => !entered.includes(k)) }));
  const num = (key: SurveyField, text: string, value: number, apply: (v: number) => SurveyDraft['survey'], min = 0, max = 10000) => (
    <label className={`field${is(key) ? ' need' : ''}`}>
      <span>{text}</span>
      <input id={`bk-${key.replace('.', '-')}`} className="input num" type="number" inputMode="numeric" min={min} max={max} step={5} value={is(key) ? '' : value}
        aria-required={is(key) || undefined} onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) change(apply(v), [key]); }} />
    </label>
  );
  const save = (): void => {
    setError(null);
    draftHandle.stop();
    start(async () => {
      const r = await saveRoomDesignAction({ calculationId, survey: s, label });
      if (r.ok) router.push(`/app/room-designs/${r.id}`);
      else setError(r.error === 'roomIssues' ? t('issuesStop') : te(r.error));
    });
  };
  const labelOf = (k: SurveyField): string => {
    const [head, sub] = k.split('.');
    if (head === 'room') return ts(`rm_${sub}`);
    if (head === 'shaft') return sub === 'wall' ? t('wall') : ts(sub ?? '');
    return t(`${head}${(sub ?? '').toUpperCase()}`);
  };
  const issue = (k: string): string => (k === 'rinvio' && d ? t('issue_rinvio', { h: Math.round(d.M.h), hMin: d.hMin ?? 0 }) : t(`issue_${k}`));
  return (
    <div className="flex flex-col gap-4">
      <section className="panel" aria-labelledby="room-fields">
        <h2 id="room-fields">{t('roomTitle')}</h2>
        <RoomFields R={s.room} put={(patch, entered = []) => change({ ...s, room: { ...s.room, ...patch } }, entered.map((k) => `room.${k}` as SurveyField))}
          blank={(k) => is(`room.${k}` as SurveyField)} choose={tb('choose')}
          machine={d ? { D: d.M.D, shimsAxis: KL.sheaveAxisPerD * d.M.D, shape: d.M.shape ?? null, rinvio: d.M.rinvio ?? null, heb: d.heb, turn: d.G?.dir } : undefined} />
        <h3>{t('shaftTitle')}</h3>
        <div className="form-grid">
          {num('shaft.W', ts('W'), s.shaft.W, (v) => ({ ...s, shaft: { ...s.shaft, W: v } }), 500)}
          {num('shaft.D', ts('D'), s.shaft.D, (v) => ({ ...s, shaft: { ...s.shaft, D: v } }), 500)}
          {num('shaft.wall', t('wall'), s.shaft.wall, (v) => ({ ...s, shaft: { ...s.shaft, wall: v } }), 50, 1000)}
        </div>
        <h3>{t('dropsTitle')}</h3>
        <p className="note">{t('dropsHint')}</p>
        <div className="form-grid">
          {num('car.x', t('carX'), s.car.x, (v) => ({ ...s, car: { ...s.car, x: v } }))}
          {num('car.y', t('carY'), s.car.y, (v) => ({ ...s, car: { ...s.car, y: v } }))}
          {num('cw.x', t('cwX'), s.cw.x, (v) => ({ ...s, cw: { ...s.cw, x: v } }))}
          {num('cw.y', t('cwY'), s.cw.y, (v) => ({ ...s, cw: { ...s.cw, y: v } }))}
        </div>
        {d ? <p className="note" role="status">{t('calata', { calc: fmt(Math.round(d.calata.calc), 0), measured: fmt(Math.round(d.calata.measured), 0) })}</p> : null}
        <SurveyFound survey={s} onChange={(next) => change(next, [])} />
      </section>
      {d ? null : <MissingPanel title={tb('title')} lead={tb('lead')} items={blank.map((k) => ({ id: `bk-${k.replace('.', '-')}`, label: labelOf(k) }))} />}
      {d?.issues.length ? <ul className="alert alert-bad" role="alert">{d.issues.map((k) => <li key={k}>{issue(k)}</li>)}</ul> : null}
      {d?.G ? <SurveyDrawings survey={s} derived={d} onChange={(next) => change(next, [])} id="survey" /> : null}
      {d?.checks.length ? (
        <section className="panel" aria-labelledby="room-checks">
          <h2 id="room-checks">{t('checksTitle')}</h2>
          <div className="table-scroll">
            <table className="data-table stack">
              <thead><tr><th scope="col">{t('check')}</th><th scope="col" className="num">{t('value')}</th><th scope="col" className="num">{t('limit')}</th><th scope="col">{t('outcome')}</th></tr></thead>
              <tbody>
                {d.checks.map((c) => (
                  <tr key={c.id}>
                    <td className="row-title">{ts(roomCheckKey(c.id, d))}{c.id === 'm_quadro' && !s.governor ? ` ${t('govNotSurveyed')}` : ''}</td>
                    <td className="num" data-label={t('value')}>{c.value === null ? '—' : `${shownValue(c, fmt)} ${c.unit}`}</td>
                    <td className="num" data-label={t('limit')}>{c.limit === null ? '—' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)} ${c.unit}`}</td>
                    <td data-label={t('outcome')}><span className={`status-pill ${c.status}`}>{ts(`st_${c.status}`)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">{t('checksNote')}</p>
        </section>
      ) : null}
      <section className="panel" aria-labelledby="room-save">
        <h2 id="room-save">{t('saveTitle')}</h2>
        <label className="field">
          <span>{t('label')}</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={pending || !d || d.issues.length > 0} onClick={save}>{pending ? t('saving') : t('save')}</button>
          {!d ? <span className="note">{tb('saveMissing', { n: blank.length })}</span> : null}
          {error ? <span className="note bad" role="alert">{error}</span> : null}
          {draft ? <DraftBar target={draft} draft={draftHandle} /> : null}
        </div>
        <p className="note">{t('saveNote')}</p>
      </section>
    </div>
  );
}
