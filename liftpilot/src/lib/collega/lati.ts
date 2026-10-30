// The saved records of an installation as the comparison reads them (confronto.ts Lato): a calculation's values as
// entered (a «Calcolo argano», or the one a design of the one form saved with it) and a lift design's one form with what
// its shaft gave (the rated load and the persons of its car) — drawn on a «Calcolo argano» (round 45), the drawing's
// side only: the machine, the ropes in place, the speed, the car's mass and the roping are its base's, compared there.
// Records are read, never changed; a record whose stored values no longer read is left out (null). Pure.
import { z } from 'zod';
import type { FormValues } from '@/calc/types';
import { formValuesSchema } from '@/lib/calc-input';
import { liftInputsReadSchema } from '@/lib/lift-input';
import { govSize } from '@/shaft/governor';
import type { Lato, Layout } from './confronto';

const numOf = (x: FormValues[string]): number | null => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};
const layoutOf = (x: FormValues[string]): Layout | null => (x === 'top' || x === 'topDefl' || x === 'bottom' ? x : null);
const tagliaOf = (x: FormValues[string]): 1 | 2 | null => (String(x) === '1' ? 1 : String(x) === '2' ? 2 : null);

/** The machine and the ropes in place of a replacement as its values hold them: the old machine when it is compared,
 *  the ropes kept in the new machine's fields otherwise. */
function inPlace(V: FormValues): Pick<Lato, 'repl' | 'funiNumero' | 'funiDiametro' | 'puleggia' | 'rapporto' | 'potenza' | 'giri' | 'poli'> {
  const repl = V.context === 'repl', compare = repl && !!V.compare, kept = repl && !!V.keepRopes && !compare;
  const o = (id: string): number | null => (compare ? numOf(V[id]) : null);
  return {
    repl, funiNumero: compare ? numOf(V.o_n) : kept ? numOf(V.n_n) : null, funiDiametro: compare ? numOf(V.o_d) : kept ? numOf(V.n_d) : null,
    puleggia: o('o_D'), rapporto: o('o_i'), potenza: o('o_Pn'), giri: o('o_nm'), poli: o('o_poles'),
  };
}

const EMPTY = { persone: null, fermate: null, funicella: null, porte: null, operatore: null } as const;

/** A saved calculation (`pStimato`: its car mass is the software's estimate — a whole project's design with the
 *  automatic car mass — not a measure to compare). */
export function latoCalcolo(rec: { id: string; createdAt: Date; inputs: unknown }, pStimato = false): Lato | null {
  const V = formValuesSchema.safeParse(rec.inputs);
  if (!V.success) return null;
  const v = V.data;
  return {
    id: rec.id, createdAt: rec.createdAt, ...EMPTY, ...inPlace(v), Q: numOf(v.Q), velocita: numOf(v.v), corsa: numOf(v.H),
    pesoCabina: pStimato ? null : numOf(v.P), layout: layoutOf(v.layout), taglia: tagliaOf(v.r),
  };
}

/** What the comparison takes of a saved shaft's results: the rated load (worked out when the largest car was asked) and
 *  the persons of the car (UNI EN 81-20, Tabelle 6 e 8). */
const shaftResults = z.object({ Q: z.number().finite(), persons: z.number().finite() }).passthrough();

const MAKERS: Readonly<Record<string, string>> = { '2sg': '2SG', fermator: 'Fermator', dapa: 'Dapa' };

const NOT_DRAWN = { repl: false, funiNumero: null, funiDiametro: null, puleggia: null, rapporto: null, potenza: null, giri: null, poli: null } as const;

/** A saved lift design: its one form as entered and its shaft's results (`based`: drawn on a «Calcolo argano», round 45 —
 *  the drawing's side only). */
export function latoProgetto(rec: { id: string; createdAt: Date; inputs: unknown; shaftResults: unknown; based?: boolean }): Lato | null {
  const L = liftInputsReadSchema.safeParse(rec.inputs);
  if (!L.success) return null;
  const { shaft: S, calc: V, auto } = L.data, res = shaftResults.safeParse(rec.shaftResults), based = !!rec.based;
  const gov = govSize(S.vertical.v, S.governor);
  return {
    id: rec.id, createdAt: rec.createdAt, ...(based ? NOT_DRAWN : inPlace(V)), Q: res.success ? res.data.Q : S.Q, persone: res.success ? res.data.persons : null,
    fermate: S.vertical.floors.length, velocita: based ? null : S.vertical.v, corsa: null, pesoCabina: based || auto.P ? null : numOf(V.P),
    layout: based ? null : layoutOf(V.layout), taglia: based ? null : tagliaOf(V.r), funicella: { d: gov.rope * 2, nome: `${gov.brand} ${gov.model}` },
    porte: `${S.doorWidth} x ${S.doorHeight}`, operatore: S.doorMaker ? MAKERS[S.doorMaker] ?? null : null,
  };
}
