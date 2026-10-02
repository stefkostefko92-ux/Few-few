'use client';

// The survey of a replacement's machine room, on the calculation of the new machine: the room (its size, height, slab,
// door, control panel, the support of the machine), the shaft under it and the existing drops as measured. The new
// machine is placed and checked live with the same code as the save (src/lib/room/derive.ts); its drawings change
// where they are; what stops a record is said with what to do. The save sends the survey only: the server derives
// everything again.
import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import type { FormValues } from '@/calc/types';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { KL } from '@/lib/lift/norme';
import { makeFmt } from '@/lib/present/tr';
import { deriveRoom } from '@/lib/room/derive';
import type { Survey } from '@/lib/room/survey';
import { isUpperLimit } from '@/shaft/checks';
import { saveRoomDesignAction } from '@/server/room-actions';
import RoomFields from '../shaft/RoomFields';
import SurveyDrawings from './SurveyDrawings';

interface Props {
  calculationId: string;
  values: FormValues;
  initial: Survey;
}

const mmIn = (raw: string): number | null => { const v = Math.round(Number(raw.replace(',', '.'))); return Number.isFinite(v) ? v : null; };

export default function RoomSurvey({ calculationId, values, initial }: Props) {
  const t = useTranslations('room'), ts = useTranslations('shaft'), te = useTranslations('errors'), locale = useLocale(), router = useRouter();
  const fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  const [s, setS] = useState<Survey>(initial);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const d = useMemo(() => deriveRoom(values, s), [values, s]);
  const M = d.M;
  const num = (text: string, value: number, apply: (v: number) => void, min = 0, max = 10000) => (
    <label className="field">
      <span>{text}</span>
      <input className="input num" type="number" inputMode="numeric" min={min} max={max} step={5} value={value}
        onChange={(e) => { const v = mmIn(e.target.value); if (v !== null) apply(v); }} />
    </label>
  );
  const save = (): void => {
    setError(null);
    start(async () => {
      const r = await saveRoomDesignAction({ calculationId, survey: s, label });
      if (r.ok) router.push(`/app/room-designs/${r.id}`);
      else setError(r.error === 'roomIssues' ? t('issuesStop') : te(r.error));
    });
  };
  const issue = (k: string): string => (k === 'rinvio' ? t('issue_rinvio', { h: Math.round(M.h), hMin: d.hMin ?? 0 }) : t(`issue_${k}`));
  return (
    <div className="flex flex-col gap-4">
      <section className="panel" aria-labelledby="room-fields">
        <h2 id="room-fields">{t('roomTitle')}</h2>
        <RoomFields R={s.room} put={(patch) => setS({ ...s, room: { ...s.room, ...patch } })}
          machine={{ D: M.D, shimsAxis: KL.sheaveAxisPerD * M.D, shape: M.shape ?? null, rinvio: M.rinvio ?? null }} />
        <h3>{t('shaftTitle')}</h3>
        <div className="form-grid">
          {num(ts('W'), s.shaft.W, (v) => setS({ ...s, shaft: { ...s.shaft, W: v } }), 500)}
          {num(ts('D'), s.shaft.D, (v) => setS({ ...s, shaft: { ...s.shaft, D: v } }), 500)}
          {num(t('wall'), s.shaft.wall, (v) => setS({ ...s, shaft: { ...s.shaft, wall: v } }), 50, 1000)}
        </div>
        <h3>{t('dropsTitle')}</h3>
        <p className="note">{t('dropsHint')}</p>
        <div className="form-grid">
          {num(t('carX'), s.car.x, (v) => setS({ ...s, car: { ...s.car, x: v } }))}
          {num(t('carY'), s.car.y, (v) => setS({ ...s, car: { ...s.car, y: v } }))}
          {num(t('cwX'), s.cw.x, (v) => setS({ ...s, cw: { ...s.cw, x: v } }))}
          {num(t('cwY'), s.cw.y, (v) => setS({ ...s, cw: { ...s.cw, y: v } }))}
        </div>
        <p className="note" role="status">{t('calata', { calc: fmt(Math.round(d.calata.calc), 0), measured: fmt(Math.round(d.calata.measured), 0) })}</p>
      </section>
      {d.issues.length ? <ul className="alert alert-bad" role="alert">{d.issues.map((k) => <li key={k}>{issue(k)}</li>)}</ul> : null}
      {d.G ? <SurveyDrawings survey={s} derived={d} onChange={setS} id="survey" /> : null}
      {d.checks.length ? (
        <section className="panel" aria-labelledby="room-checks">
          <h2 id="room-checks">{t('checksTitle')}</h2>
          <div className="table-scroll">
            <table className="data-table stack">
              <thead><tr><th scope="col">{t('check')}</th><th scope="col" className="num">{t('value')}</th><th scope="col" className="num">{t('limit')}</th><th scope="col">{t('outcome')}</th></tr></thead>
              <tbody>
                {d.checks.map((c) => (
                  <tr key={c.id}>
                    <td className="row-title">{ts(`c_${c.id}`)}</td>
                    <td className="num" data-label={t('value')}>{c.value === null ? '—' : `${fmt(c.value, c.dec)} ${c.unit}`}</td>
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
          <button type="button" className="btn btn-primary" disabled={pending || d.issues.length > 0} onClick={save}>{pending ? t('saving') : t('save')}</button>
          {error ? <span className="note bad" role="alert">{error}</span> : null}
        </div>
        <p className="note">{t('saveNote')}</p>
      </section>
    </div>
  );
}
