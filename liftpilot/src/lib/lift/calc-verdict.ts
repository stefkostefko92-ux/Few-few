// The calculation's own verdict (round 48): compute()'s checks of the machine verified and, when the ratio of the
// suspended loads changes under UNI 10411-1, D.1 and D.2 (rapporto.ts tr_d1, tr_d2) that enter its acceptance test, and
// (round 52) under UNI 10411-1 the ropes as the owner's rope sheet checks them (funi-modello.ts fm_*; S_f not counted
// where z of the sheet stands in for it, sostituite.ts) —
// the checks the calculation itself verifies beside the engine's. One count for every place that says it: the save's
// stored verdict and counts (src/server/save.ts), the pill's panel (src/lib/verdict-checks.ts), the «Calcolo argano»
// screen (Verdict.tsx), the relazione's «Argano verificato» and the copied summary, the engine's correction notice
// (scripts/engine-records.ts). compute()'s checks count all of them, but one an extra check stands in for; the extra
// ones only when they apply to the test. Pure.
import type { CheckId, FormValues, Results } from '@/calc/types';
import type { ShaftCheck } from '@/shaft/types';
import { ambitoOf, type Collaudo } from './collaudo';
import { verificheModifica } from './funi-modello';
import { senzaSostituite, sostituite } from './sostituite';

export type CalcStatus = 'ok' | 'warn' | 'fail';

export interface CalcVerdict {
  status: CalcStatus;
  /** the checks not passed: compute()'s and the extra ones */
  fails: number;
  /** the checks passed with «Attenzione» */
  warns: number;
  /** the extra checks counted, D.1 then D.2 of a changed ratio, then the rope sheet's (none when the test takes none) */
  extra: ShaftCheck[];
  /** compute()'s checks the extra ones stand in for, not counted (sostituite.ts: S_f with z of the rope sheet) */
  sostituite: CheckId[];
}

/** The checks beyond compute()'s that the calculation's verdict counts: D.1 and D.2 with the ratio of the loads changed
 *  and, round 52, the ropes as the owner's rope sheet checks them (funi-modello.ts), as far as the acceptance test `C`
 *  takes them (ambitoOf 'applies'), on the calculation's values `V`. */
export const calcExtra = (C: Collaudo, V: FormValues): ShaftCheck[] => verificheModifica(C, V).filter((c) => ambitoOf(C, c.id) === 'applies');

/** The verdict over compute()'s results and the extra checks already derived (calcExtra); compute()'s checks an extra
 *  one stands in for are not counted. */
export function calcVerdict(res: Pick<Results, 'checks' | 'fails'>, extra: readonly ShaftCheck[]): CalcVerdict {
  const fails = senzaSostituite(res.fails, extra).length + extra.filter((c) => c.status === 'fail').length;
  const warns = senzaSostituite(res.checks, extra).filter((c) => c.status === 'warn').length + extra.filter((c) => c.status === 'warn').length;
  return { status: fails ? 'fail' : warns ? 'warn' : 'ok', fails, warns, extra: [...extra], sostituite: sostituite(extra) };
}

/** The verdict of a calculation on its values `V` under its acceptance test `C`. */
export const calcVerdictOf = (res: Pick<Results, 'checks' | 'fails'>, C: Collaudo, V: FormValues): CalcVerdict => calcVerdict(res, calcExtra(C, V));
