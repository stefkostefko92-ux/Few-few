// The installation's registry for the relazione tecnica di modifica (owner's decision 8; Project.anagrafica, migration
// 27): the owner and their address, the maintenance company, the construction number, the year of installation, the
// regime the lift was approved under (regimi.ts) with its confirmation on the logbook, and the documented «before» data
// the calculation does not hold — persons, stops, the car's useful area — with where they were read. What the project,
// the plant data or the calculation already hold (matricola, committente, «Ascensore per», the documented loads, speed
// and travel) stays there: one value, one place. Mutable (projects:edit); each issued RT keeps a copy. Every field is
// optional while it is filled in; the issue asks the identity (anagraficaMancanti) and a regime (regimi.ts regimeOf).
// Validated with zod, read leniently like the plant data (plantReadSchema). Pure.
import { z } from 'zod';
import { REGIME_KEYS } from './types';
import { senzaVuoti, testo } from './fonte';

/** Where the documented «before» data were read. */
export const PRIMA_FONTI = ['libretto', 'verbale', 'rilievo', 'dichiarazione'] as const;
export type PrimaFonte = (typeof PRIMA_FONTI)[number];

/** The first year of installation accepted; the last is the current one (the day of the validation, in Italy). */
export const ANNO_MIN = 1900;
const annoCorrente = (): number => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric' }).format(new Date()));

/** The ranges of the documented «before» data: persons, stops, the car's useful area [m², two decimals]. */
export const PRIMA_RANGE = { persone: [1, 100], fermate: [2, 60], superficie: [0.1, 20] } as const;
const centesimi = (x: number): boolean => Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;

const proprietarioSchema = z.object({ nome: testo(2, 160, false), indirizzo: testo(1, 200, false) }).partial().strict();

const primaBase = z.object({
  persone: z.number().int().min(PRIMA_RANGE.persone[0]).max(PRIMA_RANGE.persone[1]),
  fermate: z.number().int().min(PRIMA_RANGE.fermate[0]).max(PRIMA_RANGE.fermate[1]),
  superficie: z.number().finite().min(PRIMA_RANGE.superficie[0]).max(PRIMA_RANGE.superficie[1]).refine(centesimi),
  fonte: z.enum(PRIMA_FONTI),
}).partial().strict();
/** A documented «before» datum always says where it was read. */
const primaSchema = primaBase.refine((p) => p.fonte !== undefined || (p.persone === undefined && p.fermate === undefined && p.superficie === undefined),
  { path: ['fonte'], message: 'fonteRichiesta' });

const campi = {
  proprietario: proprietarioSchema,
  manutentore: testo(2, 160, false),
  numeroFabbrica: testo(1, 40, false),
  annoInstallazione: z.number().int().min(ANNO_MIN).refine((y) => y <= annoCorrente(), { message: 'annoFuturo' }),
  legge: z.enum(REGIME_KEYS),
  leggeConfermata: z.boolean(),
};
const anagraficaObject = z.object({ ...campi, prima: primaSchema }).partial().strict();

/** The registry as the form sends it (an empty field is a missing one). */
export const anagraficaSchema = z.preprocess(senzaVuoti, anagraficaObject);
export type Anagrafica = z.infer<typeof anagraficaObject>;
export type Proprietario = z.infer<typeof proprietarioSchema>;
export type Prima = z.infer<typeof primaBase>;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The fields of `raw` each of its schema accepts: an unknown field, or a value an earlier form allowed outside today's
 *  range, is left out. */
function validi(shape: z.ZodRawShape, raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(shape)) {
    const r = s.safeParse(raw[k]);
    if (k in raw && r.success && r.data !== undefined) out[k] = r.data;
  }
  return out;
}

/** The registry as stored: what an earlier form had that today's does not is left out, the rest read as saved (a
 *  documented datum without its source is kept: the issue asks it again). */
export const anagraficaReadSchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const out = validi(campi, raw);
  const proprietario = validi(proprietarioSchema.shape, raw.proprietario), prima = validi(primaBase.shape, raw.prima);
  return { ...out, ...(Object.keys(proprietario).length ? { proprietario } : {}), ...(Object.keys(prima).length ? { prima } : {}) };
}, z.object({ ...campi, prima: primaBase }).partial().strict());

/** The stored registry of an installation as the RT reads it; empty when unreadable. */
export function anagraficaData(raw: unknown): Anagrafica {
  const p = anagraficaReadSchema.safeParse(raw ?? {});
  return p.success ? p.data : {};
}

/** The registry's data the issue cannot do without (refused while missing): the owner's name, the source of the
 *  documented «before» data entered. The regime is regimi.ts's (regimeOf). */
export function anagraficaMancanti(a: Anagrafica): string[] {
  const prima = a.prima, senzaFonte = !!prima && prima.fonte === undefined && (prima.persone !== undefined || prima.fermate !== undefined || prima.superficie !== undefined);
  return [...(a.proprietario?.nome ? [] : ['proprietario.nome']), ...(senzaFonte ? ['prima.fonte'] : [])];
}
