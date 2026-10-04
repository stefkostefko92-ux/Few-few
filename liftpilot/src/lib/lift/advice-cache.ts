import 'server-only';
import { createHash } from 'node:crypto';
import type { FormValues } from '@/calc/types';
import { deflectorInputs, liftAdvice, valuesAdvice, type MachineAdvice } from './advice';
import type { LiftInputs } from './derive';

// The advice weighs every machine of the catalogues (about a tenth of a second): the advice of a saved record is the
// same at every visit, so each process keeps the latest ones by the record's inputs — the catalogues are code, they
// cannot change under it. The pages, the report and the order read it; nothing changes what it returns.
const MAX = 200;
const memo = new Map<string, MachineAdvice>();

function remember(kind: string, inputs: unknown, make: () => MachineAdvice): MachineAdvice {
  const key = `${kind}:${createHash('sha256').update(JSON.stringify(inputs)).digest('hex')}`;
  const hit = memo.get(key);
  if (hit) {
    // the newest at the end: the oldest goes first
    memo.delete(key);
    memo.set(key, hit);
    return hit;
  }
  const made = make();
  memo.set(key, made);
  if (memo.size > MAX) {
    const oldest = memo.keys().next();
    if (!oldest.done) memo.delete(oldest.value);
  }
  return made;
}

/** liftAdvice of a saved design. */
export const savedLiftAdvice = (inp: LiftInputs): MachineAdvice => remember('lift', inp, () => liftAdvice(inp));

/** valuesAdvice of a saved calculation. */
export const savedValuesAdvice = (V: FormValues): MachineAdvice => remember('values', V, () => valuesAdvice(V));

/** liftAlternative of a saved design. */
export function savedLiftAlternative(inp: LiftInputs, advice: MachineAdvice): MachineAdvice | null {
  const d = advice.candidates.length ? null : deflectorInputs(inp);
  return d ? savedLiftAdvice(d) : null;
}
