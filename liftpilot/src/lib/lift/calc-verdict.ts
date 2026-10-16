// The calculation's own verdict (round 48): compute()'s checks of the machine verified and, when the ratio of the
// suspended loads changes under UNI 10411-1, D.1 and D.2 (rapporto.ts tr_d1, tr_d2) that enter its acceptance test —
// the checks the calculation itself verifies beside the engine's. One count for every place that says it: the save's
// stored verdict and counts (src/server/save.ts), the pill's panel (src/lib/verdict-checks.ts), the «Calcolo argano»
// screen (Verdict.tsx), the relazione's «Argano verificato» and the copied summary, the engine's correction notice
// (scripts/engine-records.ts). compute()'s checks count all of them, as they always have; the extra ones only when
// they apply to the test. Pure.
import type { FormValues, Results } from '@/calc/types';
import type { ShaftCheck } from '@/shaft/types';
import { ambitoOf, type Collaudo } from './collaudo';
import { rapportoChecks } from './rapporto';

export type CalcStatus = 'ok' | 'warn' | 'fail';

export interface CalcVerdict {
  status: CalcStatus;
  /** the checks not passed: compute()'s and the extra ones */
  fails: number;
  /** the checks passed with «Attenzione» */
  warns: number;
  /** the extra checks counted, D.1 then D.2 (none when the ratio stays or the test does not take them) */
  extra: ShaftCheck[];
}

/** The checks beyond compute()'s that the calculation's verdict counts: D.1 and D.2 with the ratio of the loads changed,
 *  as far as the acceptance test `C` takes them (ambitoOf 'applies'), on the calculation's values `V`. */
export const calcExtra = (C: Collaudo, V: FormValues): ShaftCheck[] => rapportoChecks(C, V).filter((c) => ambitoOf(C, c.id) === 'applies');

/** The verdict over compute()'s results and the extra checks already derived (calcExtra). */
export function calcVerdict(res: Pick<Results, 'checks' | 'fails'>, extra: readonly ShaftCheck[]): CalcVerdict {
  const fails = res.fails.length + extra.filter((c) => c.status === 'fail').length;
  const warns = res.checks.filter((c) => c.status === 'warn').length + extra.filter((c) => c.status === 'warn').length;
  return { status: fails ? 'fail' : warns ? 'warn' : 'ok', fails, warns, extra: [...extra] };
}

/** The verdict of a calculation on its values `V` under its acceptance test `C`. */
export const calcVerdictOf = (res: Pick<Results, 'checks' | 'fails'>, C: Collaudo, V: FormValues): CalcVerdict => calcVerdict(res, calcExtra(C, V));
