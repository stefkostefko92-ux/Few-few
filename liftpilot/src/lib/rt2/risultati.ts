// The base calculation's results for the RT (round 52): compute() on its values when they derive without a flagged
// field (no result is official otherwise). Pure (the server at issue, the browser for the live view).
import { compute } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import type { FormValues, Results } from '@/calc/types';

export function risultatiDi(V: FormValues): Results | null {
  const p = readInputs(V);
  return p.bad.length ? null : compute(p.I, p.N);
}
