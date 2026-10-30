// A module line as one plain number (round 44; its own file since round 57: the survey's data and its panel order read
// it): the Italian way, «1.000» is a thousand, «7,5 kW» is 7,5. Pure.
import { numeriDi } from '@/lib/rilievi/ordini/numeri';

/** One plain number in a line of the module, or null. */
export function unNumero(line: string | true | undefined): number | null {
  if (typeof line !== 'string') return null;
  const n = numeriDi(line);
  return n.length === 1 && n[0] !== undefined && n[0] > 0 ? n[0] : null;
}
