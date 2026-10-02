import 'server-only';
import { createHash } from 'node:crypto';
import { canon } from '@/calc/snapshot';
import { shaftSnapshot, type Layout, type ShaftInputs, type ShaftSnapshot } from '@/shaft';
import { shaftInputsReadSchema, shaftSourceSchema } from './shaft-input';
import type { ReportDesign } from './report/shaft';

/** SHA-256 of the canonical shaft record: engine, profile, inputs and layout together. */
export const shaftHash = (s: ShaftSnapshot): string => createHash('sha256').update(JSON.stringify(canon(s))).digest('hex');

/** Recomputes a saved design with the running engine: 'same' when the stored hash is reproduced. */
export function verifyShaftStored(inputs: ShaftInputs, sha256: string): { snapshot: ShaftSnapshot; layout: Layout; same: boolean } {
  const { snapshot, layout } = shaftSnapshot(inputs);
  return { snapshot, layout, same: shaftHash(snapshot) === sha256 };
}

export interface StoredDesign {
  id: string;
  label: string | null;
  createdAt: Date;
  sha256: string;
  engineVersion: string;
  profileId: string;
  inputs: unknown;
  source: unknown;
  user: { name: string } | null;
}

/** A saved design as the report takes it, recomputed by the running engine; null when that engine does not reproduce it. */
export function reproduceDesign(d: StoredDesign): ReportDesign | null {
  const inputs = shaftInputsReadSchema.safeParse(d.inputs);
  if (!inputs.success) return null;
  const { layout, same } = verifyShaftStored(inputs.data, d.sha256);
  if (!same) return null;
  const source = d.source ? shaftSourceSchema.safeParse(d.source) : null;
  return { id: d.id, label: d.label, createdAt: d.createdAt, sha256: d.sha256, engineVersion: d.engineVersion, profileId: d.profileId,
    author: d.user?.name ?? null, source: source?.success ? source.data : null, layout };
}
