'use client';

import { useState, type FormEvent } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import {
  fromIso, nextRevisione, nextTyreDeadline, patenteExpiry, fineDeadlines, daysUntil,
} from '@/lib/scadenze';

interface Row {
  label: string;
  date: Date;
  hint?: string;
}

// Чист клиентски калкулатор: нищо не напуска браузъра, нищо не се пази.
export function ScadenzeCalculator() {
  const t = useTranslations('deadlines');
  const format = useFormatter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const today = fromIso(new Date().toISOString().slice(0, 10));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string): Date | null => {
      const v = String(data.get(k) ?? '').trim();
      if (!v) return null;
      try { return fromIso(v); } catch { return null; }
    };
    const out: Row[] = [];
    const reg = get('registration');
    const last = get('lastRevisione');
    if (reg) out.push({ label: t('results.revisione'), date: nextRevisione(reg, today, last ?? undefined), hint: t('results.revisioneHint') });

    const tyres = nextTyreDeadline(today);
    out.push({
      label: t('results.tyres'),
      date: tyres.deadline,
      hint: tyres.kind === 'INVERNALI' ? t('results.tyresWinter') : t('results.tyresSummer'),
    });

    const birth = get('birth');
    const issued = get('patenteIssued');
    if (birth && issued) out.push({ label: t('results.patente'), date: patenteExpiry(birth, issued), hint: t('results.patenteHint') });

    const fine = get('fineNotified');
    if (fine) {
      const f = fineDeadlines(fine);
      out.push({ label: t('results.fineSconto'), date: f.scontoUntil });
      out.push({ label: t('results.fineGdp'), date: f.ricorsoGiudiceDiPaceUntil });
      out.push({ label: t('results.finePrefetto'), date: f.ricorsoPrefettoUntil });
    }
    setRows(out);
  }

  const fields: ReadonlyArray<{ name: string; label: string; optional: boolean }> = [
    { name: 'registration', label: t('form.registration'), optional: false },
    { name: 'lastRevisione', label: t('form.lastRevisione'), optional: true },
    { name: 'birth', label: t('form.birth'), optional: true },
    { name: 'patenteIssued', label: t('form.patenteIssued'), optional: true },
    { name: 'fineNotified', label: t('form.fineNotified'), optional: true },
  ];

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <form onSubmit={onSubmit} className="card space-y-4" noValidate>
        {fields.map((f) => (
          <div key={f.name}>
            <label htmlFor={`sc-${f.name}`} className="label">
              {f.label}
              {f.optional ? <span className="ml-1 text-slate-400">({t('form.optional')})</span> : null}
            </label>
            <input id={`sc-${f.name}`} name={f.name} type="date" className="field" />
          </div>
        ))}
        <button type="submit" className="btn-primary w-full">{t('form.calculate')}</button>
      </form>

      <section aria-live="polite" className="card">
        <h2 className="text-lg font-semibold">{t('results.title')}</h2>
        {rows ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {rows.map((r) => {
              const days = daysUntil(r.date, today);
              return (
                <li key={r.label} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{r.label}</span>
                    <time dateTime={r.date.toISOString().slice(0, 10)} className="font-plate text-targa-700">
                      {format.dateTime(r.date, { dateStyle: 'medium', timeZone: 'UTC' })}
                    </time>
                  </div>
                  <p className={`text-sm ${days < 0 ? 'text-red-700' : days <= 15 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {days < 0 ? t('results.overdue', { days: -days }) : t('results.daysLeft', { days })}
                  </p>
                  {r.hint ? <p className="mt-1 text-xs text-slate-500">{r.hint}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">—</p>
        )}
        <p className="mt-4 text-xs text-slate-500">{t('results.disclaimer')}</p>
      </section>
    </div>
  );
}
