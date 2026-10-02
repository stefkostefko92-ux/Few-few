import 'server-only';
// The marks of a calculation made from a lift design (src/lib/lift/marks.ts): the switches as saved, and the machine
// as proposed only when the running derivation reproduces the calculation (its values hash to the stored one).
import { NO_MARKS, deriveLift, valueMarks, type ValueMarks } from '@/lib/lift';
import { liftInputsReadSchema } from './lift-input';
import { verifyStored } from './snapshot-hash';

export function calcMarks(lift: { inputs: unknown } | null, calcSha256: string): ValueMarks {
  if (!lift) return NO_MARKS;
  const p = liftInputsReadSchema.safeParse(lift.inputs);
  if (!p.success) return NO_MARKS;
  const dv = deriveLift(p.data);
  return valueMarks(p.data.auto, verifyStored(dv.values, calcSha256).same ? dv : null, dv.bottom, dv.collaudo);
}
