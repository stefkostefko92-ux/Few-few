// One traction rope's length measured on the design: from hitch to hitch over every pulley of the rope rig of the 3D
// (rig.ts: the sheave, the diverting pulley, the head pulleys of a machine below, the pulleys of a 2:1 roping), the
// straight runs and the arcs on the wheels, with the car at the lowest floor and the counterweight where the
// simulation puts it. Sheet 1, the bill of materials, the draft order and the loads take the cut length from it
// (support.ts ropeCut) — a calculation with its shaft design on that design's rig too (layoutRigLength); without a rig
// (a replacement, which has no shaft design) they take the formula. Pure.
import { shapeOf } from '@/lib/catalog/shapes';
import type { Analysis } from '@/lib/present/analysis';
import { section, type Layout } from '@/shaft';
import type { MachineSpec } from '@/shaft/machine-room';
import { simModel } from '@/sim';
import { belt } from './belt';
import type { BottomScheme } from './bottom';
import { machineSpec, type Made } from './machine';
import { ropeRig } from './rig';

/** What the rig is drawn from: the design laid out, its calculation, its machine, the scheme of a machine below. */
export interface RigSource {
  layout: Layout;
  analysis: Analysis;
  machine: MachineSpec;
  bottom: BottomScheme | null;
}

/** One rope's length on its pulleys, hitch to hitch [m]; null when the rig cannot be drawn (values that do not make a
 *  lift, a calculation and a shaft of different layouts). */
export function rigLength(src: RigSource): number | null {
  try {
    const { I, N } = src.analysis.ctx, L = src.layout;
    const cw0 = simModel(I, N, src.analysis.res, section(L), L.inputs.vertical).cw0;
    let len = 0;
    for (const p of ropeRig(src).pieces(0, cw0)) {
      const b = belt(p.els);
      for (const [a, c] of b.runs) len += Math.hypot(c[0] - a[0], c[1] - a[1]);
      for (const arc of b.arcs) len += Math.abs(arc.sweep) * arc.r;
    }
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

/** One rope's length on the rig of the shaft design `L` with the machine of the calculation `a` as sheet 1 draws it: the
 *  maker's shape of the model the one form chose (`catalog`), else the generic machine; a machine below by its scheme
 *  (`bottom`), beside the shaft (head) without one. Sheet 1, the bill and the draft order of a calculation made from a
 *  shaft design take this one (registry impianto.funi.taglio). */
export function layoutRigLength(L: Layout, a: Analysis, catalog: Made | null = null, bottom: BottomScheme | null = null): number | null {
  const machine = machineSpec(a.ctx, a.ctx.N.mass, '', L.inputs.room, catalog ? shapeOf(catalog.brand, catalog.model) : null, catalog);
  return rigLength({ layout: L, analysis: a, machine, bottom: a.ctx.I.layout === 'bottom' ? bottom ?? 'head' : null });
}
