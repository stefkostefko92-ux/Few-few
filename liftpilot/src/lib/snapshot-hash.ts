import 'server-only';
import { createHash } from 'node:crypto';
import { canon, snapshotOf, type Snapshot } from '@/calc/snapshot';
import type { FormValues } from '@/calc/types';

/** SHA-256 of the canonical snapshot: engine, profile, values and results together. */
export const snapshotHash = (s: Snapshot): string => createHash('sha256').update(JSON.stringify(canon(s))).digest('hex');

/** Recomputes a saved calculation with the running engine: 'same' when the stored hash is reproduced. */
export function verifyStored(values: FormValues, sha256: string): { snapshot: Snapshot; same: boolean } {
  const snapshot = snapshotOf(values);
  return { snapshot, same: snapshotHash(snapshot) === sha256 };
}
