'use client';

// Card 2 of the workspace, «Modifica» (RT plan §3.2, §4.5): the RT's day (Italy's issue day when empty), the job, the
// description of the modification (required at the issue), whether the layout changes and its note, the first page's
// note; and the answers about the building's structures, asked only when the rule asks them (summary.ts strutture).
import { useTranslations } from 'next-intl';
import type { RtSummary } from '@/server/rt/summary';
import type { FormApi } from './CardSezioni';

function Testo({ id, path, label, max, rows, hint, f, required }: { id: string; path: string; label: string; max: number; rows?: number; hint?: string; f: FormApi; required?: true }) {
  const v = f.get(path), bad = f.errore(path), value = typeof v === 'string' ? v : '';
  const props = { id, className: 'input', maxLength: max, disabled: f.readOnly, value, 'aria-invalid': bad || undefined, 'aria-required': required,
    'aria-describedby': hint ? `${id}-h` : undefined };
  return (
    <div className={rows ? 'field span-2' : 'field'}>
      <label htmlFor={id}>{label}</label>
      {rows ? <textarea {...props} rows={rows} onChange={(e) => f.set(path, e.target.value || undefined)} />
        : <input {...props} onChange={(e) => f.set(path, e.target.value || undefined)} />}
      {hint ? <span id={`${id}-h`} className={bad ? 'field-hint rt-bad' : 'field-hint'}>{hint}</span> : null}
    </div>
  );
}

export default function CardModifica({ summary, f, oggi }: { summary: RtSummary; f: FormApi; oggi: string }) {
  const t = useTranslations('rt');
  const data = f.get('doc.data'), descr = f.get('doc.descrizione'), layout = f.get('doc.layoutModificato') === true;
  const n = typeof descr === 'string' ? descr.trim().length : 0, forze = f.get('strutture.forze'), pert = f.get('strutture.pertinente');
  return (
    <section className="panel rt-card" id="rt-modifica" aria-labelledby="rt-modifica-h">
      <h2 id="rt-modifica-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">2</span>{t('card.modifica')}</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="rt-data">{t('doc.data')}</label>
          <input id="rt-data" className="input" type="date" max={oggi} disabled={f.readOnly} value={typeof data === 'string' ? data : ''} aria-describedby="rt-data-h"
            aria-invalid={f.errore('doc.data') || undefined} onChange={(e) => f.set('doc.data', e.target.value || undefined)} />
          <span id="rt-data-h" className="field-hint">{t('doc.dataHint')}</span>
        </div>
        <Testo id="rt-commessa" path="doc.commessa" label={t('doc.commessa')} max={40} f={f} />
        <Testo id="rt-descr" path="doc.descrizione" label={t('doc.descrizione')} max={4000} rows={6} f={f} required
          hint={n < 20 ? t('doc.descrizioneMin', { n }) : t('doc.descrizioneOk', { n })} />
        <label className="rt-check span-2" htmlFor="rt-layout">
          <input id="rt-layout" type="checkbox" disabled={f.readOnly} checked={layout} onChange={(e) => f.set('doc.layoutModificato', e.target.checked ? true : undefined)} />
          <span>{t('doc.layout')}</span>
        </label>
        {layout ? <Testo id="rt-layout-nota" path="doc.notaLayout" label={t('doc.notaLayout')} max={500} rows={3} f={f} /> : null}
        <Testo id="rt-nota" path="doc.nota" label={t('doc.nota')} max={600} rows={3} f={f} hint={t('doc.notaHint')} />
      </div>
      <h3>{t('strutture.titolo')}</h3>
      <p className="note">{t(`strutture.esito.${summary.strutture.esito}`)}</p>
      {summary.strutture.domande.includes('forze') ? (
        <fieldset className="rt-radio">
          <legend className="field-legend">{t('strutture.forze')}</legend>
          {(['aumentano', 'non_aumentano'] as const).map((v) => (
            <label key={v} className="rt-check">
              <input type="radio" name="rt-forze" value={v} disabled={f.readOnly} checked={forze === v} onChange={() => f.set('strutture.forze', v)} />
              <span>{t(`strutture.${v}`)}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {summary.strutture.domande.includes('pertinente') ? (
        <fieldset className="rt-radio">
          <legend className="field-legend">{t('strutture.pertinente')}</legend>
          {([true, false] as const).map((v) => (
            <label key={String(v)} className="rt-check">
              <input type="radio" name="rt-pertinente" value={String(v)} disabled={f.readOnly} checked={pert === v} onChange={() => f.set('strutture.pertinente', v)} />
              <span>{t(v ? 'strutture.pertinenteSi' : 'strutture.pertinenteNo')}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </section>
  );
}
