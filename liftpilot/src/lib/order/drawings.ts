// The machine room with the machine of the draft order: its plan and section B-B laid out by the drawing kernel as the
// drawing set lays them out (src/lib/tavole/views.ts), the machine on its support with the diverting pulley — with the
// machine below, its room beside the shaft or under the pit in plan and section C-C (below-view.ts) —, each view in a
// box as wide as the report's text frame. The PDF draws them (report/relazione.py), the Word document carries them as
// pictures (report/raster.py). Pure.
import { COND, PALETTE, concreteTile } from '@/drawing';
import { shapeOf } from '@/lib/catalog/shapes';
import type { MachineCandidate } from '@/lib/lift/advice';
import { deriveLift, type LiftDerived, type LiftInputs } from '@/lib/lift/derive';
import { machineSpec } from '@/lib/lift/machine';
import type { ReportBlock, ReportDoc } from '@/lib/report/model';
import type { BottomGeo } from '@/lib/lift/bottom';
import { belowGeoOf, belowView, cropped, roomView } from '@/lib/tavole/views';
import type { MachineSpec } from '@/shaft/machine-room';
import type { Layout } from '@/shaft/types';

/** The colours, the concrete speckle and the lettering of the views. */
export const ORDER_DRAWING: NonNullable<ReportDoc['drawing']> = { palette: PALETTE, patterns: { concrete: concreteTile() }, cond: COND, images: {} };

/** The report's text frame [mm] and the most height a view may take. */
const AREA = { x0: 0, y0: 0, x1: 172, y1: 150 };

/** The plan and section B-B of the room with machine M, each under its title; none without a machine room or when a
 *  view does not fit even at 1:200. */
export function roomBlocks(L: Layout, M: MachineSpec): ReportBlock[] {
  const out: ReportBlock[] = [];
  const view = (kind: 'plan' | 'section'): ReturnType<typeof roomView> => {
    try {
      return roomView(L, M, kind, AREA);
    } catch {
      return null;
    }
  };
  for (const [kind, title] of [['plan', 'Pianta del locale macchina'], ['section', 'Sezione B-B del locale macchina']] as const) {
    const v = view(kind);
    if (!v) continue;
    const c = cropped(v);
    out.push({ t: 'h3', text: title }, { t: 'plan', shapes: c.shapes, w: c.w, h: c.h, scale: `Scala 1:${c.scale} sul foglio A4 stampato al 100%` });
  }
  return out;
}

/** The plan and section C-C of the room of a machine below (scheme geometry `g`), each under its title, as the drawing
 *  set has them in place of the machine room (src/lib/tavole/build.ts); none of a view that does not fit. */
export function belowBlocks(L: Layout, M: MachineSpec, g: BottomGeo): ReportBlock[] {
  const out: ReportBlock[] = [];
  const view = (kind: 'plan' | 'section'): ReturnType<typeof cropped> | null => {
    try {
      return cropped(belowView(L, M, g, kind, AREA));
    } catch {
      return null;
    }
  };
  for (const [kind, title] of [['plan', 'Pianta del locale dell’argano in basso'], ['section', 'Sezione C-C del locale dell’argano in basso']] as const) {
    const c = view(kind);
    if (c) out.push({ t: 'h3', text: title }, { t: 'plan', shapes: c.shapes, w: c.w, h: c.h, scale: `Scala 1:${c.scale} sul foglio A4 stampato al 100%` });
  }
  return out;
}

/** The lift design with machine `m`: as saved when it verified that machine, else derived again with it (its frame, its
 *  axis, its bedplate, its rope geometry). */
export const designWith = (inp: LiftInputs, d: LiftDerived, m: MachineCandidate, recorded: boolean): LiftDerived =>
  (recorded ? d : deriveLift({ ...inp, calc: { ...inp.calc, layout: m.I.layout }, catalog: { brand: m.brand, model: m.model }, auto: { ...inp.auto, machine: true } }));

/** The room of a lift design with machine `m` (designWith): the machine room over the shaft, or the room of the machine
 *  below in plan and section C-C (the drawing set's sheets of it). */
export function designRoom(inp: LiftInputs, d: LiftDerived, m: MachineCandidate, recorded: boolean): ReportBlock[] {
  const x = designWith(inp, d, m, recorded);
  return x.bottom ? belowBlocks(x.layout, x.machine, belowGeoOf(x.analysis, x.layout, x.machine, x.bottom)) : roomBlocks(x.layout, x.machine);
}

/** The room of the shaft design a calculation comes from, with machine `m` as the calculation (or the advice) verified
 *  it; none with the machine below (the calculation has no scheme of it). */
export function calcRoom(L: Layout, m: MachineCandidate): ReportBlock[] {
  if (m.I.layout === 'bottom') return [];
  return roomBlocks(L, calcSpec(L, m));
}

/** Machine `m` as a calculation verified it, in the room of the shaft design `L` (its maker's shape, its bedplate). */
export const calcSpec = (L: Layout, m: MachineCandidate): MachineSpec =>
  machineSpec({ I: m.I, N: m.N }, m.N.mass, '', L.inputs.room, shapeOf(m.brand, m.model), { brand: m.brand, model: m.model });
