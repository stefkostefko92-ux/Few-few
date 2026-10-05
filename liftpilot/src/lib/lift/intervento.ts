// The intervention of the one form: the machine replaced on an existing lift, the lift renewed but its sling (arcata),
// or a new lift. The first two are modifications of the existing lift, tested to UNI 10411-1 or -11 (a check applies
// when the intervention touches what it checks); a new lift is tested to UNI EN 81-20/50, every check applies. Keeping
// the existing sling is the site practice that keeps a renovation a modification instead of a complete replacement,
// which is tested as a new lift (registry impianto.rifacimento; research, chapter 16 §3.2 and §5.3). The intervention
// is the calculation's context and, for the renovation, the mark on the acceptance test (collaudo.ts). Pure.
import type { FormValues } from '@/calc/types';
import { collaudoOf, type Collaudo, type NormaCollaudo, type Parte } from './collaudo';

export const INTERVENTI = ['repl', 'rifacimento', 'new'] as const;
export type Intervento = (typeof INTERVENTI)[number];

/** What a renovation replaces: every part but the sling, which stays as it is (a change of speed, rated load or travel
 *  is ticked when there is one). */
export const PARTI_RIFACIMENTO: readonly Parte[] = ['machine', 'ropes', 'car', 'cw', 'rails', 'landingDoors', 'carDoors', 'buffers', 'governor', 'controller'];

/** The intervention of the one form: the calculation's context and, for a modification, the renovation chosen. */
export const interventoOf = (calc: FormValues, chosen?: Collaudo): Intervento =>
  (calc.context === 'new' ? 'new' : collaudoOf(calc, chosen).rifacimento ? 'rifacimento' : 'repl');

/** What choosing an intervention sets: the calculation's context and, when it changes, the acceptance test. The
 *  renovation ticks every part but the sling under the part of UNI 10411 chosen (-1 by default; never EN 81-20/50,
 *  which tests the lift as new) and takes new ropes free of those in place; back to the machine's replacement, the
 *  machine alone with the ropes' number and diameter in place (the replacement's practice, registry sostituzione.funi).
 *  Otherwise what was chosen stays, as it does under a new lift (tested as new whatever it holds), so going to a new
 *  lift and back loses nothing. The standards added stay. */
export function interventoTo(k: Intervento, chosen?: Collaudo): { calc: FormValues; collaudo?: Collaudo } {
  if (k === 'new') return { calc: { context: 'new' } };
  const norma: NormaCollaudo = chosen && chosen.norma !== 'en81' ? chosen.norma : '10411-1';
  const added = chosen?.aggiuntive?.length ? { aggiuntive: chosen.aggiuntive } : {};
  if (k === 'rifacimento') {
    return chosen?.rifacimento && chosen.norma !== 'en81' ? { calc: { context: 'repl' }, collaudo: chosen }
      : { calc: { context: 'repl', keepRopes: false }, collaudo: { norma, parti: PARTI_RIFACIMENTO, rifacimento: true, ...added } };
  }
  return chosen?.rifacimento ? { calc: { context: 'repl', keepRopes: true }, collaudo: { norma, parti: ['machine'], ...added } } : { calc: { context: 'repl' } };
}
