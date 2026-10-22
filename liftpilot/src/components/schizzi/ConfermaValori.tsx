'use client';

// The confirm table of measures proposed for a form (round 50): read on a survey sketch by the model, or measured on a
// DXF/DWG drawing. Each row: the measure, what was read (or «measured on the drawing»), the proposed value in a field
// of its kind and range (editable; the form's value beside it when it differs), the confidence, «Confermo». A value the
// model read starts unchecked — the technician ticks each one he checked on the sketch (or types it: a valid value
// typed ticks its row) —, filled in from a confidence of 0.6 up, empty under it with the text read as the hint; a
// measure taken on a drawing starts checked. «Applica i valori confermati» puts only the checked, valid rows into the
// form (src/lib/schizzi/applica.ts) and says how many went in and why any did not. Nothing is saved here: the form
// saves as before.
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { campoDi, valoreValido, type Target, type TipoCampo } from '@/lib/schizzi/campi';
import type { Rifiuto, Valore, ValoreCampo } from '@/lib/schizzi/applica';

/** A proposed measure. */
export interface Riga {
  id: string;
  value: ValoreCampo;
  /** 0..1 from the model; null: measured, not read */
  confidence: number | null;
  /** the text read on the sketch for it (empty: measured on a drawing) */
  read: string;
  note?: string;
}

/** The form the values go into: what it holds for an id (null: nothing entered), the confirmed values put in and, on
 *  /progetto, the name the form gives a stop (its label; the index when it has none). */
export interface Modulo {
  attuale(id: string): ValoreCampo | null;
  applica(valori: Valore[]): { applied: string[]; refused: { id: string; code: Rifiuto }[] };
  fermata?(i: number): string;
}

/** Below this the model's value is not proposed as it is: the field starts empty. */
export const AFFIDABILITA_MINIMA = 0.6;

type Stato = { on: boolean; text: string; done: boolean };

const asText = (v: ValoreCampo): string => String(v);
/** A row as the table opens: a value read by the model never checked (each one is the technician's), filled only from
 *  AFFIDABILITA_MINIMA up; a measure on a drawing checked with its value. */
function iniziale(r: Riga, fonte: 'ai' | 'cad'): Stato {
  const unsure = r.confidence !== null && r.confidence < AFFIDABILITA_MINIMA;
  return { on: fonte === 'cad', text: unsure ? '' : asText(r.value), done: false };
}
/** The value a field's text gives, or null when there is none. */
function valoreDi(tipo: TipoCampo, text: string): ValoreCampo | null {
  const s = text.trim();
  if (!s) return null;
  switch (tipo.kind) {
    case 'mm':
    case 'int': {
      const n = Number(s.replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    case 'enum': return s;
    case 'bool': return s === 'true' ? true : s === 'false' ? false : null;
  }
}
const intervallo = (tipo: TipoCampo): string => (tipo.kind === 'mm' ? `${tipo.min}–${tipo.max} mm` : tipo.kind === 'int' ? `${tipo.min}–${tipo.max}` : '');

/** A measure's label and a value as the panel writes them: the stops by the form's names (the technician thinks in
 *  them), the main stop — an index from the bottom — with its place when its name differs from it. */
export function useTestiCampo(target: Target, fermata?: (i: number) => string) {
  const t = useTranslations('schizzi');
  const nome = (i: number): string => fermata?.(i) ?? String(i);
  const stop = (i: number): string => (nome(i) === String(i) ? String(i) : t('fermataDalBasso', { label: nome(i), i }));
  const etichetta = (id: string): string => {
    const c = campoDi(target, id);
    return c ? t(`campi.${c.campo.label}`, c.index === null ? {} : { n: nome(c.index) }) : id;
  };
  const mostra = (id: string, v: ValoreCampo): string => {
    const c = campoDi(target, id);
    if (c?.campo.id === 'main' && typeof v === 'number') return stop(v);
    return c?.campo.tipo.kind === 'mm' ? `${v} mm` : typeof v === 'number' ? String(v) : t(`valori.${String(v)}`);
  };
  return { etichetta, mostra };
}

export default function ConfermaValori({ target, righe, fonte, modulo, caption, applicati }: {
  target: Target; righe: readonly Riga[]; fonte: 'ai' | 'cad'; modulo: Modulo; caption: string;
  /** the message once n values went in */
  applicati(n: number): string;
}) {
  const t = useTranslations('schizzi'), uid = useId(), { etichetta, mostra } = useTestiCampo(target, modulo.fermata);
  const [stato, setStato] = useState<Record<string, Stato>>(() => Object.fromEntries(righe.map((r) => [r.id, iniziale(r, fonte)])));
  const [esito, setEsito] = useState<{ ok: string | null; refused: string[] } | null>(null);
  const of = (id: string): Stato => stato[id] ?? { on: false, text: '', done: false };
  const put = (id: string, patch: Partial<Stato>): void => setStato((s) => ({ ...s, [id]: { ...of(id), ...s[id], ...patch } }));
  const valido = (r: Riga, text: string): ValoreCampo | null => {
    const c = campoDi(target, r.id), v = c ? valoreDi(c.campo.tipo, text) : null;
    return c && v !== null && valoreValido(c.campo.tipo, v) === 'ok' ? v : null;
  };
  const confermati = righe.flatMap((r): Valore[] => {
    const s = of(r.id), v = s.on && !s.done ? valido(r, s.text) : null;
    return v === null ? [] : [{ id: r.id, value: v }];
  });

  const applica = (): void => {
    if (!confermati.length) return setEsito({ ok: null, refused: [t('tabella.nessunoConfermato')] });
    const r = modulo.applica(confermati);
    setStato((s) => {
      const next = { ...s };
      for (const id of r.applied) next[id] = { ...of(id), on: false, done: true };
      return next;
    });
    setEsito({ ok: r.applied.length ? applicati(r.applied.length) : null, refused: r.refused.map((x) => `${etichetta(x.id)} (${t(`rifiuti.${x.code}`)})`) });
  };

  const field = (r: Riga) => {
    const c = campoDi(target, r.id), s = of(r.id), id = `${uid}-${r.id.replace('.', '-')}`;
    if (!c) return null;
    const tipo = c.campo.tipo, change = (text: string): void => put(r.id, { text, on: valido(r, text) !== null });
    if (tipo.kind === 'enum' || tipo.kind === 'bool') {
      const values = tipo.kind === 'enum' ? tipo.values : ['true', 'false'];
      return (
        <select id={id} className="input" value={s.text} onChange={(e) => change(e.target.value)} disabled={s.done} aria-label={etichetta(r.id)}>
          <option value="">{t('tabella.scegli')}</option>
          {values.map((v) => <option key={v} value={v}>{t(`valori.${v}`)}</option>)}
        </select>
      );
    }
    return (
      <span className="schizzo-num">
        <input id={id} className="input num" type="number" inputMode="numeric" min={tipo.min} max={tipo.max} step={1} value={s.text} disabled={s.done}
          aria-label={etichetta(r.id)} aria-invalid={(s.text.trim() !== '' && valido(r, s.text) === null) || undefined} onChange={(e) => change(e.target.value)} />
        {tipo.kind === 'mm' ? <span className="unit">mm</span> : null}
      </span>
    );
  };

  return (
    <div className="schizzo-conferma" data-fonte={fonte}>
      <div className="table-scroll">
        <table className="data-table stack">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{t('tabella.campo')}</th>
              <th scope="col">{t(fonte === 'cad' ? 'tabella.lettoCad' : 'tabella.letto')}</th>
              <th scope="col">{t('tabella.valore')}</th>
              {fonte === 'ai' ? <th scope="col" className="num">{t('tabella.affidabilita')}</th> : null}
              <th scope="col">{t('tabella.conferma')}</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const s = of(r.id), c = campoDi(target, r.id), cur = modulo.attuale(r.id), v = valido(r, s.text);
              const unsure = r.confidence !== null && r.confidence < AFFIDABILITA_MINIMA;
              return (
                <tr key={r.id} data-campo={r.id} className={s.done ? 'done' : unsure ? 'unsure' : undefined}>
                  <td className="row-title">{etichetta(r.id)}</td>
                  <td data-label={t(fonte === 'cad' ? 'tabella.lettoCad' : 'tabella.letto')}>
                    <div>
                      <span className="mono">{r.read || t('tabella.misurato')}</span>
                      {r.note ? <span className="note">{r.note}</span> : null}
                    </div>
                  </td>
                  <td data-label={t('tabella.valore')}>
                    <div>
                      {field(r)}
                      {c?.campo.id === 'main' && v !== null && mostra(r.id, v) !== String(v) ? <span className="note">{t('tabella.fermata', { fermata: mostra(r.id, v) })}</span> : null}
                      {cur !== null && (v === null || cur !== v) ? <span className="note">{t('tabella.nelModulo', { value: mostra(r.id, cur) })}</span> : null}
                      {unsure && !s.text ? <span className="note">{t('tabella.inserisci')}</span> : null}
                      {s.text.trim() !== '' && v === null && c ? <span className="note bad">{t('tabella.invalido', { range: intervallo(c.campo.tipo) || t('tabella.scegli') })}</span> : null}
                    </div>
                  </td>
                  {fonte === 'ai' ? (
                    <td data-label={t('tabella.affidabilita')} className={`num${unsure ? ' bad' : ''}`}>
                      {r.confidence === null ? '—' : `${Math.round(r.confidence * 100)} %`}{unsure ? ` · ${t('tabella.bassa')}` : ''}
                    </td>
                  ) : null}
                  <td data-label={t('tabella.conferma')}>
                    <div>
                      {s.done ? <span className="badge ok">{t('tabella.applicato')}</span> : (
                        <label className="check">
                          <input type="checkbox" checked={s.on && v !== null} disabled={v === null} onChange={(e) => put(r.id, { on: e.target.checked })}
                            aria-label={t('tabella.confermaDi', { campo: etichetta(r.id) })} />
                          <span aria-hidden="true">{t('tabella.conferma')}</span>
                        </label>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={applica} disabled={!confermati.length}>{t('tabella.applica')}</button>
        {esito?.ok ? <span className="note" role="status">{esito.ok}</span> : null}
      </div>
      {esito?.refused.length ? (
        <p className="note bad" role="alert">{esito.ok ? `${t('tabella.nonApplicati')} ` : ''}{esito.refused.join('; ')}</p>
      ) : null}
    </div>
  );
}
