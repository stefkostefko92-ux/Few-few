// The relazione di calcolo's machine on a lift design (src/lib/report/build.ts): the machine drawn and weighed as the
// design's derivation and sheet 1 take them, the load on its support, and the checks that need the machine — the beams,
// the car's top under what hangs over it, a machine below in its rooms, the clearance on the counterweight's sign, the
// height of an existing room, the existing sling — as the design's verdict takes them. Without a design: the
// calculation's machine mass alone. Pure.
import type { ShaftCheck } from '@/shaft';
import { cwGapOver } from '@/shaft/cw-gap';
import { roomGeo, type MachineSpec } from '@/shaft/machine-room';
import { existingRoomCheck } from '@/shaft/room-above';
import type { SupportLoad } from '@/shaft/support-check';
import type { Layout } from '@/shaft/types';
import { slingCheck } from '../lift/arcata';
import { belowChecks } from '../lift/below-checks';
import { bottomGeo, sheaveHalfBelow, type BottomScheme } from '../lift/bottom';
import type { Collaudo } from '../lift/collaudo';
import { headTopChecks } from '../lift/head';
import { massModelOf } from '../lift/known';
import { machineSpec, sheaveAxisBelow } from '../lift/machine';
import { machineMass } from '../lift/machine-mass';
import type { ValueMarks } from '../lift/marks';
import { carichiOf } from '../lift/modifica';
import { rigLength } from '../lift/rope';
import { withRig } from '../lift/shaft-rig';
import { carriedBy, supportChecks, supportLoad, supportMass } from '../lift/support';
import { shapeOf } from '../catalog/shapes';
import type { Analysis } from '../present/analysis';
import type { ReportInput } from './build';

export interface DesignMachine {
  /** the machine as the design draws it; null without a design */
  machine: MachineSpec | null;
  /** the maker's model whose whole machine the loads count (known.ts) */
  weighed: { brand: string; model: string } | null;
  /** a machine below: its rope scheme */
  scheme: BottomScheme | null;
  L: Layout | null;
  /** one rope's length on the design's rope rig [m] */
  rope: number | null;
  /** the load on the support as the design and sheet 1 count it */
  ld: SupportLoad;
  /** the maker's bedplate with the pulley [kg] */
  bed: number;
  /** the checks that need the machine */
  beams: ShaftCheck[];
}

export function designMachine(r: ReportInput, a: Analysis, C: Collaudo, m: ValueMarks): DesignMachine {
  const { ctx, res } = a, { I, N } = ctx;
  const made = m.catalog ? { brand: m.catalog.brand, model: m.catalog.model } : null;
  const machine = r.design ? machineSpec(ctx, N.mass, '', r.design.layout.inputs.room, made ? shapeOf(made.brand, made.model) : null, made) : null;
  // the maker's model whose whole machine the loads count: the proposal's, else the catalogue's machine the values are
  // (one entered by hand) — the one named below, as the design's derivation and sheet 1 take it (known.ts)
  const weighed = massModelOf(I, N, r.values, made);
  const scheme = I.layout === 'bottom' ? m.bottom ?? 'head' : null, L = r.design?.layout ?? null;
  // the support's load as the design and sheet 1 count it: the whole machine with what carries it, the pulley's own stand
  // on the floor apart (support.ts), the ropes at their cut length on the design's rope rig
  const rope = L && machine ? rigLength({ layout: L, analysis: a, machine, bottom: scheme }) : null;
  const sm = L && machine ? supportMass(roomGeo(L, machine), machine) : null;
  const ld = supportLoad(ctx, res.Mcw, { machine: sm ? carriedBy(sm, machineMass(N, weighed).kg) : N.mass, rope, stand: sm?.stand });
  const bed = machine ? supportMass(null, machine).maker : 0;
  const g = L && machine && scheme ? bottomGeo(L, scheme, machine.D, I.Dp, machine.n, machine.d, I.r, sheaveAxisBelow(machine.D, machine.shape ?? null),
    sheaveHalfBelow(machine.D, machine.n, machine.d, machine.shape ?? null)) : null;
  const beams = L && machine ? [...supportChecks(L, machine, ld, !scheme), ...headTopChecks(withRig(L, I.r, I.Dp, machine.n, machine.d, g), I.r, I.Dp, scheme), ...(g ? belowChecks(L, g, machine, I.Dp) : [])] : [];
  // the clearance on the counterweight's sign with the car's top under what hangs over it (cw-gap.ts), as sheet 1 gives it
  if (L) beams.push(...cwGapOver(L, beams));
  // a modification: the existing room's height under 2,0 m (UNI 10411-1:2024, 9.2), as the design's verdict takes it
  if (I.context === 'repl' && L?.inputs.room && !scheme) beams.push(existingRoomCheck(L.inputs.room));
  // the existing sling under a new car or rated load (arcata.ts), as the design's verdict takes it
  const sling = slingCheck(C, carichiOf(r.values));
  if (L && sling) beams.push(sling);
  return { machine, weighed, scheme, L, rope, ld, bed, beams };
}
