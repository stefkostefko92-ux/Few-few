// One traction rope's length measured on the design: from hitch to hitch over every pulley of the rope rig of the 3D
// (rig.ts: the sheave, the diverting pulley, the head pulleys of a machine below, the pulleys of a 2:1 roping), the
// straight runs and the arcs on the wheels, with the car at the lowest floor and the counterweight where the
// simulation puts it. Sheet 1, the bill of materials, the draft order and the loads take the cut length from it
// (support.ts ropeCut); without a rig they take the formula. Pure.
import type { Analysis } from '@/lib/present/analysis';
import { section, type Layout } from '@/shaft';
import type { MachineSpec } from '@/shaft/machine-room';
import { simModel } from '@/sim';
import { belt } from './belt';
import type { BottomScheme } from './bottom';
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
