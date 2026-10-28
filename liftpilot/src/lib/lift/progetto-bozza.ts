// What a drawing of the Progetto still needs on its «Calcolo argano» before anything is worked out (round 53: the same
// rule for the Progetto's form and for the simulation of its draft): the one form's values still to enter, and the access
// to the shaft when the test adds DM 236/1989 (its save refuses none, src/server/lift-actions.ts). Pure.
import type { Collaudo, LiftInputs } from '@/lib/lift';
import { missingOf, type BlankKey, type LiftDraft } from './blank';
import { composto, type BaseCalcolo, type ProgettoDraft } from './progetto';

export function mancantiDi(L: LiftDraft, collaudo: Collaudo | null | undefined): BlankKey[] {
  const dm236 = !!collaudo?.aggiuntive?.includes('dm236');
  return [...missingOf(L), ...(dm236 && !L.blank.includes('access') && L.inputs.shaft.access === 'none' ? ['access' as const] : [])];
}

/** A drawing's draft on its base, as the simulation reads it: the composed inputs, or how many values are still to enter. */
export function inputsDellaBozza(d: ProgettoDraft, base: BaseCalcolo): { inputs: LiftInputs } | { manca: number } {
  const L = composto(d, base), manca = mancantiDi(L, base.collaudo);
  return manca.length ? { manca: manca.length } : { inputs: L.inputs };
}
