// Canonical record of a shaft design: engine and profile versions, the inputs and the projection of the layout that a
// saved design stores and hashes. Pure: the hash is taken by the caller (src/lib/shaft-hash.ts).
import { canon, type Json } from '../calc/snapshot';
import { PROFILO } from '../calc/norme';
import { layout } from './layout';
import type { Layout, ShaftInputs } from './types';

/** Version of the shaft engine (semver): a change of rule or of a default is a minor or major version. */
export const SHAFT_ENGINE_VERSION = '2.17.0';

export interface ShaftSnapshot {
  engine: string;
  profile: string;
  inputs: Json;
  results: Json;
}

/** The layout without its inputs (stored beside it) and with the checks reduced to what they decide. */
export function projectLayout(L: Layout): Json {
  const rest: Partial<Layout> = { ...L };
  delete rest.inputs;
  return canon({ ...rest, checks: L.checks.map((c) => ({ id: c.id, status: c.status, value: c.value, limit: c.limit })) });
}

export function shaftSnapshot(I: ShaftInputs): { snapshot: ShaftSnapshot; layout: Layout } {
  const L = layout(I);
  return { snapshot: { engine: SHAFT_ENGINE_VERSION, profile: PROFILO.id, inputs: canon(I), results: projectLayout(L) }, layout: L };
}
