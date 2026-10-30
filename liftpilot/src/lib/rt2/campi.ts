// A component's form as data (types.ts CampoRt2): the schema that validates what it sends, the values a module reads
// (the entered one, else the software's proposal), which required fields are missing, and the helpers the modules share
// to write a check and a printed value. One description per field serves the form, the draft, the issue and the
// page. Pure.
import { z } from 'zod';
import type { CampoRt2, ConfrontoRt2, ContestoRt2, DatiRt2, EsitoVerificaRt2, ValoreRt2, VerificaRt2 } from './types';

type ConValore = Exclude<CampoRt2, { t: 'gruppo' }>;
export const conValore = (c: CampoRt2): c is ConValore => c.t !== 'gruppo';

/** The schema of one field's value; a draft keeps what is typed within the ranges (an empty field is a missing one). */
function schemaCampo(c: ConValore): z.ZodTypeAny {
  switch (c.t) {
    case 'num': {
      const n = z.number().finite().min(c.min).max(c.max);
      return c.int ? n.int() : n;
    }
    case 'scelta': {
      const vs = c.opzioni.map((o) => o.v);
      return z.string().refine((s) => vs.includes(s));
    }
    case 'testo': return z.string().trim().max(c.max);
    case 'si_no': return z.boolean();
  }
}

/** The schema of a component's inputs: every field optional (what is required is asked by `mancantiCampi` at issue,
 *  as it may depend on the others and on the context), nothing else. */
export function schemaDati(campi: readonly CampoRt2[]): z.ZodType<DatiRt2> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const c of campi) if (conValore(c)) shape[c.id] = schemaCampo(c).optional();
  return z.object(shape).strict() as unknown as z.ZodType<DatiRt2>;
}

/** The inputs with the software's proposals under them: what the module computes with. */
export const conProposte = (x: DatiRt2, proposte: DatiRt2 | undefined): DatiRt2 => ({ ...(proposte ?? {}), ...x });

const shownIn = (c: CampoRt2, x: DatiRt2, ctx: ContestoRt2): boolean => !c.show || c.show(x, ctx);

/** The required fields shown and empty (a proposal fills a field). */
export function mancantiCampi(campi: readonly CampoRt2[], x: DatiRt2, ctx: ContestoRt2): string[] {
  return campi.filter(conValore).filter((c) => {
    if (!shownIn(c, x, ctx)) return false;
    const req = typeof c.req === 'function' ? c.req(x, ctx) : !!c.req;
    return req && (x[c.id] === undefined || x[c.id] === '');
  }).map((c) => c.id);
}

export const num = (x: DatiRt2, id: string): number | null => {
  const v = x[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
export const str = (x: DatiRt2, id: string): string | null => {
  const v = x[id];
  return typeof v === 'string' && v !== '' ? v : null;
};
export const bool = (x: DatiRt2, id: string): boolean | null => {
  const v: ValoreRt2 | undefined = x[id];
  return typeof v === 'boolean' ? v : null;
};

/** Italian number: fixed decimals, comma, no grouping (the documents' style); '—' when unknown. */
export function fmt(x: number | null | undefined, dec: number): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const s = (Math.round(x * 10 ** dec) / 10 ** dec).toFixed(dec);
  return (s === `-${(0).toFixed(dec)}` ? (0).toFixed(dec) : s).replace('.', ',');
}

/** Whether `v` meets the limit(s); a tolerance of 1e-9 relative keeps a value printed equal to its limit on the right
 *  side of it. */
export function soddisfa(v: number, conf: ConfrontoRt2, lim: number, lim2?: number | null): boolean {
  const e = 1e-9 * Math.max(1, Math.abs(lim));
  switch (conf) {
    case '>=': return v >= lim - e;
    case '<=': return v <= lim + e;
    case '>': return v > lim + e;
    case '<': return v < lim - e;
    case 'tra': return v >= lim - e && (lim2 === null || lim2 === undefined || v <= lim2 + e);
  }
}

/** A check: met or not (unknown value or limit: not met, as nothing proves it), or information only. */
export function verifica(
  id: string, testo: string, valore: number | null, confronto: ConfrontoRt2, limite: number | null,
  o: { unita?: string; dec?: number; rif: string; limite2?: number | null; info?: boolean; warn?: boolean },
): VerificaRt2 {
  const known = valore !== null && Number.isFinite(valore) && limite !== null && Number.isFinite(limite);
  const met = known && soddisfa(valore, confronto, limite, o.limite2);
  const esito: EsitoVerificaRt2 = o.info ? 'info' : met ? 'ok' : o.warn ? 'warn' : 'fail';
  return { id, testo, valore, limite, ...(o.limite2 !== undefined ? { limite2: o.limite2 } : {}), confronto, unita: o.unita ?? '', dec: o.dec ?? 2, esito, rif: o.rif };
}
