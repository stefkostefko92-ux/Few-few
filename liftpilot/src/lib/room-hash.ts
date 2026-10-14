import 'server-only';
// The machine room of a replacement on the server: its record's hash, and a saved one derived again with the running
// engines (its calculation's values and the survey), reproduced or not.
import type { FormValues } from '@/calc/types';
import { canonHash } from './canon-hash';
import { deriveRoom, type RoomDerived } from './room/derive';
import { roomSnapshot, type RoomSnapshot } from './room/snapshot';
import { surveySchema, type Survey } from './room/survey';

/** SHA-256 of the canonical record of a room: engine, calculation, survey and results together. */
export const roomHash = (s: RoomSnapshot): string => canonHash(s);

export interface Reproduced {
  survey: Survey;
  derived: RoomDerived;
  /** the running engines give the stored hash */
  same: boolean;
}

/** A saved room derived again from its stored survey and its calculation's values; null when the survey does not read. */
export function reproduceRoom(r: { inputs: unknown; sha256: string }, values: FormValues, calcSha256: string): Reproduced | null {
  const s = surveySchema.safeParse(r.inputs);
  if (!s.success) return null;
  const derived = deriveRoom(values, s.data);
  return { survey: s.data, derived, same: roomHash(roomSnapshot(s.data, calcSha256, derived)) === r.sha256 };
}
