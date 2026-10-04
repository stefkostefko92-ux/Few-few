// The machine room with the machine of the draft order: its plan and section B-B laid out by the drawing kernel as the
// drawing set lays them out (src/lib/tavole/views.ts), the machine on its support with the diverting pulley, each view
// in a box as wide as the report's text frame. The PDF draws them (report/relazione.py), the Word document carries them
// as pictures (report/raster.py). Pure.
import { COND, PALETTE, concreteTile } from '@/drawing';
import { shapeOf } from '@/lib/catalog/shapes';
import type { MachineCandidate } from '@/lib/lift/advice';
import { deriveLift, type LiftDerived, type LiftInputs } from '@/lib/lift/derive';
import { machineSpec } from '@/lib/lift/machine';
import type { ReportBlock, ReportDoc } from '@/lib/report/model';
import { cropped, roomView } from '@/lib/tavole/views';
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

/** The room of a lift design with machine `m`: the design as saved when it verified that machine, else derived again
 *  with it (its frame, its axis, its bedplate). None with the machine below: the views draw a room over the shaft, which
 *  the drawing set leaves out then too (src/lib/tavole/build.ts). */
export function designRoom(inp: LiftInputs, d: LiftDerived, m: MachineCandidate, recorded: boolean): ReportBlock[] {
  if (m.I.layout === 'bottom') return [];
  const x = recorded ? d : deriveLift({ ...inp, calc: { ...inp.calc, layout: m.I.layout }, catalog: { brand: m.brand, model: m.model }, auto: { ...inp.auto, machine: true } });
  return roomBlocks(x.layout, x.machine);
}

/** The room of the shaft design a calculation comes from, with machine `m` as the calculation (or the advice) verified
 *  it; none with the machine below. */
export function calcRoom(L: Layout, m: MachineCandidate): ReportBlock[] {
  if (m.I.layout === 'bottom') return [];
  return roomBlocks(L, machineSpec({ I: m.I, N: m.N }, m.N.mass, '', L.inputs.room, shapeOf(m.brand, m.model), { brand: m.brand, model: m.model }));
}
