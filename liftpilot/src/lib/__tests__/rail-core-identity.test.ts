// The shared-engine extractions of round 49 (RT plan §4.6) give the same bits as before: the rails' geometry out of
// forces.ts (railGeometryOf), the rails' check core with its options (railCheckCore), the counterweight rails' core
// (cwRailCore), the safety gear's type (sgTypeCheck), the buffers' stroke for a speed (strokeFor) and the governor's
// sheave ratio (govSheaveCheck). The SHA-256 of every output — each number as its IEEE 754 bits, -0 and NaN included —
// over a sweep of layouts and the round-37 fuzz fixtures was pinned with the code BEFORE the change: a difference means
// the extraction is wrong (redo it, never bump a version to hide it). Families pinned one by one, so a failure names
// what moved. The whole corpus of the database and the drawing sets is proven by the S0 captures (scratchpad r49/proofs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deriveLift } from '@/lib/lift';
import type { Plant } from '@/lib/plant';
import { BUFFER_TYPES, bufferStroke, bufferType, defaultInputs, govSize, layout, maxSpeed, tripWindow, withBufferType, type Layout, type ShaftInputs } from '@/shaft';
import { strokeNeeded } from '@/shaft/buffers';
import { governorChecks } from '@/shaft/governor';
import { RAIL_TYPES } from '@/shaft/rails';
import { loadCases, loadingCases, railForces, type LiftUse, type SafetyGear } from '../tavole/forces';
import { omega, railCheck, railChecks, railLimits } from '../tavole/rail-check';
import { cwRailCheck, cwRailChecks, cwRails } from '../tavole/cw-rail-check';
import { sheetRails } from '../tavole/sheet-loads';
import * as FUZZ from './fuzz-fixtures';

/** Every value with its numbers as their bits: the same text only for the very same doubles. */
function bits(x: unknown): unknown {
  if (typeof x === 'number') return `f${Buffer.from(new Float64Array([x]).buffer).toString('hex')}`;
  if (Array.isArray(x)) return x.map(bits);
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, bits(v)]));
  }
  return x;
}
const sha = (x: unknown): string => createHash('sha256').update(JSON.stringify(bits(x))).digest('hex');

const GEARS: readonly SafetyGear[] = ['progressive', 'roller', 'instantaneous'];
const USES: readonly (LiftUse | undefined)[] = [undefined, 'goods', 'goodsHeavy'];
const PLANTS: readonly Plant[] = [{}, { safetyGear: 'roller', carBracketPitch: 1800, cwBracketPitch: 2200, liftUse: 'goodsHeavy', cwSafetyGear: 'progressive' }];

/** Layouts: sizes × counterweight side and entrances × speeds × car rails × buffers, and the fuzz fixtures' lifts. */
function corpus(): { id: string; L: Layout }[] {
  const out: { id: string; L: Layout }[] = [];
  for (const [W, D] of [[1400, 1500], [1800, 2000], [2000, 2300]] as const) {
    for (const [cw, ent] of [['rear', 'one'], ['left', 'one'], ['right', 'opposite'], ['rear', 'adjacent']] as const) {
      for (const v of [0.63, 1.6, 2.5]) {
        for (const [rail, bt] of [['T70-1/A', undefined], ['T89/B', 'pu'], ['T127-1/B', 'oil']] as const) {
          const b = defaultInputs(W, D);
          let V = { ...b.vertical, v };
          if (bt) V = withBufferType(withBufferType(V, 'car', bt), 'cw', bt);
          const I: ShaftInputs = { ...b, cw, entrances: ent, carRail: rail, cwRail: rail === 'T70-1/A' ? 'T45/A' : 'T50/A', vertical: V, Q: v > 1 ? 630 : null, access: 'none' };
          out.push({ id: `${W}x${D}:${cw}:${ent}:${v}:${rail}`, L: layout(I) });
        }
      }
    }
  }
  for (const [name, f] of Object.entries(FUZZ).sort(([a], [b]) => (a < b ? -1 : 1))) if (typeof f === 'function') out.push({ id: `fuzz:${name}`, L: deriveLift((f as () => Parameters<typeof deriveLift>[0])()).layout });
  return out;
}

type Families = Record<string, (L: Layout) => unknown>;
const PQ = (L: Layout): [number, number][] => [[700, 630], [1200, Math.round(L.Q)]];
const FAMILIES: Families = {
  railForces: (L) => PQ(L).flatMap(([P, Q]) => GEARS.map((g) => railForces(L, P, Q, g))),
  loadCases: (L) => PQ(L).flatMap(([P, Q]) => [1.2, 2, 3, 5].map((k) => loadCases(L, P, Q, k))),
  loadingCases: (L) => PQ(L).flatMap(([P, Q]) => USES.map((u) => loadingCases(L, P, Q, u))),
  railCheck: (L) => RAIL_TYPES.flatMap((t) => PQ(L).flatMap(([P, Q]) => GEARS.flatMap((g) => [[1500, 18000], [3200, 40000]].map(([l, len]) => railCheck(L, t, P, Q, g, l, len, 'goods'))))),
  railChecks: (L) => PQ(L).flatMap(([P, Q]) => GEARS.flatMap((g) => [0.63, 0.64, 1.6].map((v) => railChecks(railCheck(L, L.inputs.carRail, P, Q, g, 2000, 18000), g, v)))),
  cwRail: (L) => PLANTS.flatMap((Pl) => [500, 1200].flatMap((M) => [...GEARS.map((g) => [cwRailCheck(L, M, g, Pl), cwRailChecks(cwRailCheck(L, M, g, Pl)), cwRails(L, M, g, Pl)]), cwRails(L, M, null, Pl)])),
  sheetRails: (L) => PLANTS.flatMap((Pl) => PQ(L).map(([P, Q]) => sheetRails(L, P, Q, Pl))),
  buffers: (L) => {
    const V = L.inputs.vertical;
    return [BUFFER_TYPES.map((t) => strokeNeeded(V, t)), (['car', 'cw'] as const).map((s) => [bufferStroke(V, s), bufferType(V, s)]), BUFFER_TYPES.map(maxSpeed)];
  },
  governor: (L) => [governorChecks(L), govSize(L.inputs.vertical.v, L.inputs.governor), GEARS.map((g) => tripWindow(L.inputs.vertical.v, g))],
};

/** Pinned with the code before the extraction (round 49, S3): per family, over the whole corpus. */
const PINNED: Readonly<Record<string, string>> = {
  railForces: '9127b874813bae8d4473c57110a9751fd3a8fcdff1a3532228fece917f92ad10',
  loadCases: '75b21bb46e6b05ab3bad5b1efaa79035f196bdb6c69bcae1a0d2654cbba2c645',
  loadingCases: 'c80e34a5292ab7ee3e35d9994aae06329c5657ac95e417cd8f88e94cc66d2dd6',
  railCheck: '143281e533aad8587ea47c82ca7964fec2d8656b55099f52e6aca3d3284572b2',
  railChecks: '77315c6c03da2160b24544f0c8be218d5b9e68bb595d4876e7339bf757439da9',
  cwRail: '2a735fd47e675f2d8ec778ecd146c8a8a8e71f4f98fa4eddb5a44e600dbd07af',
  sheetRails: '60fd3e3e635a2c82ed40487a87b399e9779a30da90ae571fdac9246fe2999f06',
  buffers: '6d0b010c94973b4cc0e0f337b2721c436a8088d3bed80ccf3962c8a8c85113f7',
  governor: '48c05deeb53cedbe8ab35e30f0a65353ac955dec3bfdc260da418d4fbd560abd',
  scalars: '8741c3ea0e76b8996ea0525c57dd855f0f4610dc26e41fe96c68dfa0e2ec301b',
};

const scalars = (): unknown => [Array.from({ length: 280 }, (_, i) => omega(i * 0.97 + 0.5)), railLimits()];

test('estrazioni del motore condiviso: le stesse uscite bit per bit di prima (guide, contrappeso, ammortizzatori, limitatore)', () => {
  const layouts = corpus();
  assert.ok(layouts.length >= 100, 'il corpus dei layout');
  const got: Record<string, string> = { scalars: sha(scalars()) };
  for (const [name, f] of Object.entries(FAMILIES)) got[name] = sha(layouts.map(({ id, L }) => [id, f(L)]));
  if (process.env.RAIL_IDENTITY_PRINT) process.stdout.write(`${JSON.stringify(got, null, 2)}\n`);
  assert.deepEqual(got, PINNED);
});
