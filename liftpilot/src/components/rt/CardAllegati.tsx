'use client';

// Card 4 of the workspace, «Allegati» (RT plan §6, §7): the documents the modification expects with their state
// («Allegato n», delivered separately, «da allegare ⚠» — never blocking), which file is which document (the automatic
// match, a file chosen, or «consegnato separatamente») and an upload preset with its kind and section; the files of the
// relazione in their order (up, down, out, in), with the pages they add and the RT's limits; under them the installation's
// files themselves (upload, edit, delete: AllegatiPanel, rendered by the server).
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { AllegatoKind, Componente } from '@/lib/allegati/kinds';
import { RT_ALLEGATI_LIMITS } from '@/lib/allegati/limits';
import { makeFmt } from '@/lib/present/tr';
import type { RtSummary } from '@/server/rt/summary';
import AllegatoUpload from '@/components/allegati/AllegatoUpload';
import type { Option } from '@/components/allegati/options';
import type { FormApi } from './CardSezioni';

/** A file of the installation as the card lists it. */
export interface FileRt { id: string; title: string; kindLabel: string; pages: number; size: number }

const STATO: Readonly<Record<string, string>> = { allegato: 'ok', separato: 'info', da_allegare: 'warn' };
const fmt = makeFmt('it');

export default function CardAllegati({ summary, f, files, projectId, upload, panel }: {
  summary: RtSummary; f: FormApi; files: readonly FileRt[]; projectId: string;
  upload: { kinds: Option<AllegatoKind>[]; components: Option<Componente>[] } | null; panel: ReactNode;
}) {
  const t = useTranslations('rt');
  const chosen = f.inputs.allegati ?? [], ids = chosen.map((a) => a.attachmentId), byId = new Map(files.map((x) => [x.id, x]));
  const inRt = ids.flatMap((id) => { const x = byId.get(id); return x ? [x] : []; }), fuori = files.filter((x) => !ids.includes(x.id));
  const pagine = inRt.reduce((n, x) => n + x.pages, 0), bytes = inRt.reduce((n, x) => n + x.size, 0);
  const put = (next: string[]): void => f.set('allegati', next.length ? next.map((id) => chosen.find((a) => a.attachmentId === id) ?? { attachmentId: id }) : undefined);
  const move = (i: number, d: -1 | 1): void => { const n = [...ids], j = i + d, a = n[i], b = n[j]; if (a === undefined || b === undefined) return; n[i] = b; n[j] = a; put(n); };
  const documento = (id: string, v: string): void => f.set(`documenti.${id}`, v || undefined);
  const over = inRt.length > RT_ALLEGATI_LIMITS.maxFiles || pagine > RT_ALLEGATI_LIMITS.maxPages || bytes > RT_ALLEGATI_LIMITS.maxBytes;
  return (
    <>
    <section className="panel rt-card" id="rt-allegati" aria-labelledby="rt-allegati-h">
      <h2 id="rt-allegati-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">4</span>{t('card.allegati')}</h2>
      <h3>{t('allegati.attesi')}</h3>
      {summary.documenti.length ? (
        <ul className="rt-docs" aria-label={t('allegati.attesi')}>
          {summary.documenti.map((d) => {
            const v = f.get(`documenti.${d.id}`), sel = typeof v === 'string' ? v : '';
            return (
              <li key={d.id} data-documento={d.id}>
                <div className="rt-doc-head">
                  <span className="rt-doc-title">{d.titolo}{d.consigliato ? ` ${t('allegati.consigliato')}` : ''}</span>
                  <span className={`status-pill ${STATO[d.stato] ?? ''}`}>{d.testo}</span>
                </div>
                <span className="rt-clausola">{d.clausola}</span>
                <div className="rt-doc-actions">
                  <label className="sr-only" htmlFor={`rt-doc-${d.id}`}>{t('allegati.quale', { titolo: d.titolo })}</label>
                  <select id={`rt-doc-${d.id}`} className="input" disabled={f.readOnly} value={sel} onChange={(e) => documento(d.id, e.target.value)}>
                    <option value="">{t('allegati.automatico')}</option>
                    {inRt.map((x, i) => <option key={x.id} value={x.id}>{t('allegati.opzione', { n: i + 1, titolo: x.title })}</option>)}
                    <option value="separato">{t('allegati.separato')}</option>
                  </select>
                  {upload && !f.readOnly ? (
                    <details className="rt-doc-upload">
                      <summary>{t('allegati.carica')}</summary>
                      <AllegatoUpload projectId={projectId} kinds={upload.kinds} components={upload.components}
                        preset={{ kind: d.kind, component: d.componente, title: d.titolo }} legend={t('allegati.caricaPer', { titolo: d.titolo })} />
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="note">{t('allegati.nessunoAtteso')}</p>}
      <h3>{t('allegati.fascicolo')}</h3>
      <p className={over ? 'note bad' : 'note'} role={over ? 'alert' : undefined}>
        {t('allegati.conteggio', { n: inRt.length, pagine: fmt(pagine, 0), maxFile: RT_ALLEGATI_LIMITS.maxFiles, maxPagine: fmt(RT_ALLEGATI_LIMITS.maxPages, 0) })}
      </p>
      {inRt.length ? (
        <ol className="rt-ordine" aria-label={t('allegati.fascicolo')}>
          {inRt.map((x, i) => (
            <li key={x.id} data-allegato-rt={x.id}>
              <span className="rt-n">{t('allegati.n', { n: i + 1 })}</span>
              <span className="rt-file">{x.title}<span className="note"> · {x.kindLabel} · {t('allegati.pagine', { n: x.pages })}</span></span>
              {!f.readOnly ? (
                <span className="rt-row">
                  <button type="button" className="btn btn-sm btn-icon" disabled={i === 0} aria-label={t('allegati.su', { titolo: x.title })} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="btn btn-sm btn-icon" disabled={i === inRt.length - 1} aria-label={t('allegati.giu', { titolo: x.title })} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="btn btn-sm btn-ghost" aria-label={t('allegati.togliDi', { titolo: x.title })} onClick={() => put(ids.filter((id) => id !== x.id))}>{t('allegati.togli')}</button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : <p className="note">{t('allegati.vuoto')}</p>}
      {fuori.length && !f.readOnly ? (
        <>
          <h3>{t('allegati.fuori')}</h3>
          <p className="note">{t('allegati.fuoriNota')}</p>
          <ul className="rt-list">
            {fuori.map((x) => (
              <li key={x.id}><span>{x.title}<span className="note"> · {x.kindLabel}</span></span>
                <button type="button" className="btn btn-sm" aria-label={t('allegati.includiDi', { titolo: x.title })} onClick={() => put([...ids, x.id])}>{t('allegati.includi')}</button></li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
    {panel}
    </>
  );
}
