import 'server-only';
// A saved lift design derived again from its form, and whether the running engines reproduce the records saved with it
// (the derivation's version, the shaft design's and the calculation's hashes). The design's page and order, and the
// page and order of the calculation made from it, follow the design: the advice with the machine room and the sheave
// direct pull needs, the order with the room drawn — never the calculator's values alone.
import { snapshotOf } from '@/calc/snapshot';
import { LIFT_ENGINE_VERSION, deriveLift, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { shaftSnapshot } from '@/shaft';
import { liftInputsReadSchema } from './lift-input';
import { shaftHash } from './shaft-hash';
import { snapshotHash } from './snapshot-hash';

export interface LiftRecord {
  inputs: LiftInputs;
  dv: LiftDerived;
  /** the running engines give the same records: its documents may be made */
  same: boolean;
}

export function liftRecord(d: { inputs: unknown; engineVersion: string }, shaftSha256: string | null | undefined, calcSha256: string): LiftRecord | null {
  const p = liftInputsReadSchema.safeParse(d.inputs);
  if (!p.success) return null;
  const dv = deriveLift(p.data);
  const same = d.engineVersion === LIFT_ENGINE_VERSION && shaftHash(shaftSnapshot(dv.shaft).snapshot) === shaftSha256
    && snapshotHash(snapshotOf(dv.values)) === calcSha256;
  return { inputs: p.data, dv, same };
}
