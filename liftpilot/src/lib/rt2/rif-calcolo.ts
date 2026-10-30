// The clauses of a calculation's check as the RT prints them: the calculation's registry (VOCI) for the lift's test
// standard, the machine's groove and standard and its buffers (report/refs.ts checkRefs, as the relazione di calcolo
// cites them). Pure.
import { readInputs } from '@/calc/inputs';
import { VOCI } from '@/calc/norme';
import type { CheckId, FormValues } from '@/calc/types';
import { checkRefs } from '../report/refs';
import type { Norma10411 } from '../lift/modifica';

export function rifCalcolo(id: CheckId, V: FormValues, norma: Norma10411): string {
  const { I, N } = readInputs(V);
  return checkRefs(VOCI, id, { norma, groove: N.groove.type, std: I.std, corsaRidotta: I.buffers }) || 'modello di calcolo del software';
}
