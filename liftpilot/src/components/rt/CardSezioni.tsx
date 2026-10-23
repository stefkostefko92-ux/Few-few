'use client';

// Card 3 of the workspace, «Sezioni e componenti» (RT plan §7): the sections the rule brings, locked, each with why (the
// part or the case with its clause); those the engineer adds with a reason (and takes out again); for each section in
// the relazione, the component data the base does not hold (campi.ts) and its checks as the document prints them, live
// from the server's derivation (summary.ts). Nothing here is computed in the browser.
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { RtInputs } from '@/lib/rt/input';
import type { RtPath, SezioneKey } from '@/lib/rt/types';
import type { RtSummary } from '@/server/rt/summary';
import { BLOCCHI, campiDi } from './campi';
import Campo, { type FileOpt } from './Campo';

export interface FormApi {
  inputs: RtInputs;
  get: (path: string) => unknown;
  set: (path: string, value: unknown) => void;
  errore: (path: string) => boolean;
  files: readonly FileOpt[];
  readOnly: boolean;
}

const STATO: Readonly<Record<string, string>> = { ok: 'ok', warn: 'warn', fail: 'fail', info: 'info' };

function Verifiche({ righe, label }: { righe: RtSummary['verifiche'][number]['righe']; label: string }) {
  const t = useTranslations('rt');
  if (!righe.length) return null;
  return (
    <div className="table-scroll">
      <table className="data-table stack rt-checks" aria-label={label}>
        <thead><tr><th scope="col">{t('col.verifica')}</th><th scope="col" className="num">{t('col.valore')}</th><th scope="col" className="num">{t('col.limite')}</th>
          <th scope="col">{t('col.esito')}</th><th scope="col">{t('col.rif')}</th></tr></thead>
        <tbody>
          {righe.map((r, i) => (
            <tr key={`${r.label}-${i}`}>
              <td className="row-title">{r.label}</td>
              <td className="num" data-label={t('col.valore')}>{r.valore}</td>
              <td className="num" data-label={t('col.limite')}>{r.limite}</td>
              <td data-label={t('col.esito')}><span className={`status-pill ${STATO[r.stato] ?? ''}`}>{r.esito.split('\n')[0]}</span></td>
              <td data-label={t('col.rif')} className="rt-ref">{r.ref}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Blocchi({ k, f, path, norma }: { k: SezioneKey; f: FormApi; path: RtPath; norma: string }) {
  const t = useTranslations('rt');
  return (
    <>
      {BLOCCHI.filter((b) => b.sezione === k).map((b) => {
        const base = `componenti.${b.path}`, campi = campiDi(b, path, norma, (x) => f.get(`${base}.${x}`));
        if (!campi.length) return null;
        return (
          <fieldset key={b.path} className="rt-blocco" data-blocco={b.path}>
            <legend>{t(`blocchi.${b.titolo}`)}</legend>
            <div className="form-grid">
              {campi.map((c) => <Campo key={c.k} spec={c} path={`${base}.${c.k}`} gruppo={b.gruppo} get={f.get} set={f.set} errore={f.errore} files={f.files} readOnly={f.readOnly} />)}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}

function Aggiungi({ k, titolo, f }: { k: SezioneKey; titolo: string; f: FormApi }) {
  const t = useTranslations('rt'), id = useId(), [open, setOpen] = useState(false), [motivo, setMotivo] = useState('');
  const add = (): void => {
    f.set('sezioniManuali', [...(f.inputs.sezioniManuali ?? []), { key: k, motivo: motivo.trim() }]);
    setOpen(false);
    setMotivo('');
  };
  if (!open) return <button type="button" className="btn btn-sm" disabled={f.readOnly} onClick={() => setOpen(true)}>{t('sezioni.aggiungi', { titolo })}</button>;
  return (
    <div className="rt-aggiungi">
      <label htmlFor={id}>{t('sezioni.motivo', { titolo })}</label>
      <input id={id} className="input" maxLength={300} value={motivo} autoFocus onChange={(e) => setMotivo(e.target.value)} aria-describedby={`${id}-h`} />
      <span id={`${id}-h`} className="field-hint">{t('sezioni.motivoHint')}</span>
      <div className="rt-row">
        <button type="button" className="btn btn-sm btn-primary" disabled={motivo.trim().length < 3} onClick={add}>{t('sezioni.conferma')}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>{t('annulla')}</button>
      </div>
    </div>
  );
}

export default function CardSezioni({ summary, f }: { summary: RtSummary; f: FormApi }) {
  const t = useTranslations('rt');
  const manuali = f.inputs.sezioniManuali ?? [], inRt = new Set(summary.sezioni.map((s) => s.key));
  const togli = (k: SezioneKey): void => f.set('sezioniManuali', manuali.filter((m) => m.key !== k).length ? manuali.filter((m) => m.key !== k) : undefined);
  const motivoDi = (k: SezioneKey, v: string): void => f.set('sezioniManuali', manuali.map((m) => (m.key === k ? { ...m, motivo: v } : m)));
  return (
    <section className="panel rt-card" id="rt-sezioni" aria-labelledby="rt-sezioni-h">
      <h2 id="rt-sezioni-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">3</span>{t('card.sezioni')}</h2>
      <p className="note">{t('sezioni.lead')}</p>
      {summary.sezioni.map((s) => {
        const man = manuali.find((m) => m.key === s.key);
        return (
          <article key={s.key} className="rt-sezione" data-sezione={s.key} aria-labelledby={`rt-s-${s.key}`}>
            <header className="rt-sezione-head">
              <h3 id={`rt-s-${s.key}`}>{s.titolo}</h3>
              <span className={`chip ${s.automatica ? 'rt-auto' : 'rt-man'}`}>{t(s.automatica ? 'sezioni.automatica' : 'sezioni.manuale')}</span>
            </header>
            {s.automatica ? (
              <ul className="rt-motivi" aria-label={t('sezioni.perche')}>
                {s.motivi.map((m, i) => <li key={i}><span>{m.testo}</span>{m.clausola ? <span className="rt-clausola">{m.clausola}</span> : null}</li>)}
              </ul>
            ) : man ? (
              <div className="field">
                <label htmlFor={`rt-m-${s.key}`}>{t('sezioni.motivoBreve')}</label>
                <input id={`rt-m-${s.key}`} className="input" maxLength={300} value={man.motivo} disabled={f.readOnly} aria-invalid={man.motivo.trim().length < 3 || undefined}
                  onChange={(e) => motivoDi(s.key, e.target.value)} />
                {!f.readOnly ? <button type="button" className="btn btn-sm btn-ghost w-fit" onClick={() => togli(s.key)}>{t('sezioni.togli')}</button> : null}
              </div>
            ) : null}
            <Blocchi k={s.key} f={f} path={summary.path} norma={summary.norma} />
            <Verifiche righe={summary.verifiche.find((v) => v.key === s.key)?.righe ?? []} label={t('sezioni.verificheDi', { titolo: s.titolo })} />
          </article>
        );
      })}
      {/* a manual section the summary does not show yet (its reason still short, or the next refresh) */}
      {manuali.filter((m) => !inRt.has(m.key)).map((m) => (
        <p key={m.key} className="note">{t('sezioni.inAttesa', { titolo: summary.aggiungibili.find((a) => a.key === m.key)?.titolo ?? m.key })}
          {!f.readOnly ? <> <button type="button" className="btn btn-sm btn-ghost" onClick={() => togli(m.key)}>{t('sezioni.togli')}</button></> : null}</p>
      ))}
      {summary.aggiungibili.some((a) => !inRt.has(a.key) && !manuali.some((m) => m.key === a.key)) ? (
        <div className="rt-aggiungibili">
          <h3>{t('sezioni.altre')}</h3>
          <p className="note">{t('sezioni.altreLead')}</p>
          <ul className="rt-list">
            {summary.aggiungibili.filter((a) => !inRt.has(a.key) && !manuali.some((m) => m.key === a.key)).map((a) => (
              <li key={a.key}><span>{a.titolo}</span><Aggiungi k={a.key} titolo={a.titolo} f={f} /></li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
