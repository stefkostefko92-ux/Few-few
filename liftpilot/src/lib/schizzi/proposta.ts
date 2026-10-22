// The model's reading of a sketch made into the proposal the technician confirms (round 50): the answer is untrusted
// (it read an untrusted picture), so it is parsed loosely and then kept only as far as the catalog allows — a field the
// target does not have is dropped, a value of the wrong type or out of the form's range is moved to «not read» with the
// reason (never clamped: a clamped value would look read), a stop beyond the stops read likewise, a field given twice
// keeps its first value; the confidence is brought within 0..1, the texts are made plain (no control or direction
// characters), cut to 120 characters (the warnings to 200, at most 10). Nothing here is stored. Pure: the server makes
// it, the panel shows it.
import { z } from 'zod';
import { plainText } from '@/lib/allegati/kinds';
import { CAMPI, campoDi, valoreValido, type Target } from './campi';

export const UNITA = ['mm', 'cm', 'm', 'mixed', 'unknown'] as const;
export type Unita = (typeof UNITA)[number];

export interface CampoProposto {
  /** the form's id (`rise.3` for an indexed field) */
  id: string;
  value: number | string | boolean;
  /** 0..1 */
  confidence: number;
  /** the text read on the sketch for it (≤ 120 characters) */
  read: string;
  note?: string;
}

/** Why a field is not proposed: the model did not read it, its value has the wrong type, it is out of the form's range
 *  (or beyond the stops read), it was given twice. */
export type MotivoNonLetto = 'nonLetto' | 'tipo' | 'fuoriIntervallo' | 'doppio';
export interface NonLetto { id: string; code: MotivoNonLetto; reason: string }

export interface Proposta {
  target: Target;
  /** the unit the model assumed for most measures of the sketch */
  units: Unita;
  fields: CampoProposto[];
  notRead: NonLetto[];
  /** ≤ 10, ≤ 200 characters each */
  warnings: string[];
  /** the model that answered (a refusal fallback may answer with another than the one asked) */
  model: string;
  promptVersion: string;
}

const TEXT_MAX = 120, WARNING_MAX = 200, WARNINGS = 10, NOT_READ_MAX = 200;

/** A text as the product shows it: plain, one line, at most `n` characters (code points). */
export const testo = (v: unknown, n: number): string => (typeof v === 'string' ? Array.from(plainText(v)).slice(0, n).join('').trim() : '');

const loose = z.object({
  units: z.unknown().optional(),
  fields: z.array(z.object({ id: z.unknown(), value: z.unknown(), confidence: z.unknown().optional(), read: z.unknown().optional(), note: z.unknown().optional() }).passthrough()).max(1000),
  notRead: z.array(z.union([z.string(), z.object({ id: z.unknown(), reason: z.unknown().optional() }).passthrough()])).max(1000).optional(),
  warnings: z.array(z.unknown()).max(1000).optional(),
}).passthrough();

const confidenceOf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const shown = (v: unknown): string => testo(typeof v === 'string' ? v : JSON.stringify(v) ?? '', 40);

/** The reasons we give, in the product's language. */
const REASON: Readonly<Record<Exclude<MotivoNonLetto, 'nonLetto'>, (v: unknown, range: string) => string>> = {
  tipo: (v) => `Valore letto non utilizzabile (${shown(v)}).`,
  fuoriIntervallo: (v, range) => `Valore ${shown(v)} fuori dall’intervallo ammesso${range ? ` (${range})` : ''}.`,
  doppio: () => 'Indicato più volte: vale il primo.',
};

/** The catalog's order of an id (indexed ones by their index), for a stable list. */
function order(target: Target): (id: string) => number {
  const list = CAMPI[target];
  return (id) => {
    const c = campoDi(target, id);
    return c ? list.indexOf(c.campo) * 1000 + (c.index ?? 0) : Number.MAX_SAFE_INTEGER;
  };
}

/**
 * The proposal from the model's answer (its JSON already parsed), or null when the answer does not have the shape at
 * all (no list of fields): the route then answers that the reading failed.
 */
export function propostaDa(raw: unknown, target: Target, model: string, promptVersion: string): Proposta | null {
  const p = loose.safeParse(raw);
  if (!p.success) return null;
  const fields: CampoProposto[] = [], notRead: NonLetto[] = [], seen = new Set<string>();
  const skip = (id: string, code: Exclude<MotivoNonLetto, 'nonLetto'>, v: unknown, range = ''): void => {
    notRead.push({ id, code, reason: REASON[code](v, range) });
  };
  for (const f of p.data.fields) {
    if (typeof f.id !== 'string') continue;
    const id = f.id.trim(), c = campoDi(target, id);
    if (!c) continue; // a field the target does not have
    if (seen.has(id)) { skip(id, 'doppio', f.value); continue; }
    seen.add(id);
    const ok = valoreValido(c.campo.tipo, f.value), t = c.campo.tipo;
    const range = t.kind === 'mm' || t.kind === 'int' ? `${t.min}–${t.max}` : t.kind === 'enum' ? t.values.join(', ') : '';
    if (ok !== 'ok') { skip(id, ok, f.value, range); continue; }
    const value = f.value as number | string | boolean, note = testo(f.note, TEXT_MAX);
    fields.push({ id, value, confidence: confidenceOf(f.confidence), read: testo(f.read, TEXT_MAX), ...(note ? { note } : {}) });
  }
  // the stops read bound the indexed fields and the main stop: none beyond them
  const floors = fields.find((f) => f.id === 'floors')?.value;
  if (typeof floors === 'number') {
    const beyond = (f: CampoProposto): boolean => {
      const c = campoDi(target, f.id);
      if (c?.campo.id === 'rise') return (c.index ?? 0) > floors - 2;
      if (c?.campo.id === 'fdoor') return (c.index ?? 0) > floors - 1;
      return f.id === 'main' && typeof f.value === 'number' && f.value > floors - 1;
    };
    for (const f of fields.filter(beyond)) skip(f.id, 'fuoriIntervallo', f.value, `${floors} fermate`);
    for (let i = fields.length - 1; i >= 0; i--) if (beyond(fields[i] as CampoProposto)) fields.splice(i, 1);
  }
  for (const n of p.data.notRead ?? []) {
    const id = typeof n === 'string' ? n.trim() : typeof n.id === 'string' ? n.id.trim() : '';
    if (!campoDi(target, id) || seen.has(id) || notRead.some((x) => x.id === id)) continue;
    notRead.push({ id, code: 'nonLetto', reason: typeof n === 'string' ? '' : testo(n.reason, TEXT_MAX) });
  }
  const by = order(target);
  fields.sort((a, b) => by(a.id) - by(b.id));
  notRead.sort((a, b) => by(a.id) - by(b.id));
  const units = typeof p.data.units === 'string' ? p.data.units.trim().toLowerCase() : '';
  return {
    target,
    units: (UNITA as readonly string[]).includes(units) ? (units as Unita) : 'unknown',
    fields,
    notRead: notRead.slice(0, NOT_READ_MAX),
    warnings: (p.data.warnings ?? []).map((w) => testo(w, WARNING_MAX)).filter((w) => w !== '').slice(0, WARNINGS),
    model: testo(model, 80) || 'unknown',
    promptVersion,
  };
}
