// The plan's distances set by hand that put a part beyond the shaft's walls (round 37): the car and its rails, the
// counterweight, a door's opening, the buffers and the governor's rope stand inside the shaft, or the drawings place
// them off their views and the checks that measure round them (a machine below's runs, the room under the shaft) lose
// their geometry. Out of place but inside the shaft is the checks' to say (v_place, v_fit, v_buffer, v_gov …); beyond
// a wall no design is, and the save refuses it at the distance that put it there (shaftInputsSchema), with the range
// that distance may take. Pure.
import { bufferPlan } from './pit';
import { governorSpot } from './governor';
import type { Layout, PlanKey, Wall } from './types';

export interface PlanOutside {
  key: PlanKey;
  /** the range the distance may take with the rest as it is [mm], whole millimetres inward; min > max when none */
  min: number;
  max: number;
}

/** The plan's distances set by hand on `L` that put a part beyond the shaft's walls, each once. */
export function planOutside(L: Layout): PlanOutside[] {
  const I = L.inputs, fix = I.plan ?? {}, { W, D } = I, out = new Map<PlanKey, PlanOutside>();
  const wallLen = (w: Wall): number => (w === 'front' || w === 'rear' ? W : D);
  // a part from a to b along a length `len`: past either end, the distance `key` set by hand moved it out; it may go
  // from `min` to `max`
  const along = (key: PlanKey, a: number, b: number, len: number, min: number, max: number): void => {
    if (fix[key] !== undefined && (a < 0 || b > len) && !out.has(key)) out.set(key, { key, min: Math.ceil(min), max: Math.floor(max) });
  };
  along('carX', L.car.x, L.car.x + L.car.w, W, 0, W - L.car.w);
  // the car rails' axes from the doors' wall: a central sling's line, a cantilever's front rail and the distance to the
  // rear one
  const ys = L.rails.filter((r) => r.kind === 'car').map((r) => r.y), y0 = Math.min(...ys), y1 = Math.max(...ys);
  along('railY', y0, y1, D, 0, D - (y1 - y0));
  if (fix.railY === undefined) along('dbg', y0, y1, D, 0, D - y0);
  else along('dbg', y0, y1, D, 0, D - fix.railY);
  // the counterweight along its wall: its start, or its length when only that is set (it stays centred)
  const rear = L.cwSide === 'rear', len = rear ? L.cw.w : L.cw.h, c0 = rear ? L.cw.x : L.cw.y, cwWall = rear ? W : D;
  if (fix.cwPos !== undefined) along('cwPos', c0, c0 + len, cwWall, 0, cwWall - len);
  else along('cwLen', c0, c0 + len, cwWall, 0, len + 2 * Math.min(c0, cwWall - c0 - len));
  for (const d of L.doors) {
    const n = wallLen(d.wall);
    along(d.side === 'A' ? 'doorA' : 'doorB', d.u0, d.u1, n, 0, n - (d.u1 - d.u0));
    along(d.side === 'A' ? 'landA' : 'landB', d.l0, d.l1, n, 0, n - (d.l1 - d.l0));
  }
  // the buffers' plates on the pit floor: the car's across (their middle, or their spread when only that is set) and
  // along the depth (their rows), the counterweight's along its wall
  const B = bufferPlan(L), half = B.span === null ? 0 : B.span / 2, row = B.rows.length > 1 ? L.car.h / 4 : 0;
  for (const s of B.spots) {
    const [x, y] = s.c;
    if (s.kind === 'car') {
      if (fix.bufX !== undefined) along('bufX', x - s.r, x + s.r, W, half + s.r, W - half - s.r);
      else along('bufSpan', x - s.r, x + s.r, W, 0, 2 * (Math.min(B.x, W - B.x) - s.r));
      along('bufY', y - s.r, y + s.r, D, row + s.r, D - row - s.r);
    } else {
      const u = rear ? x : y;
      along('cwBufPos', u - s.r, u + s.r, cwWall, s.r, cwWall - s.r);
    }
  }
  // the governor's rope: its plane from its side wall, its two strands from the front wall
  const g = governorSpot(L);
  if (g) {
    along('govX', g.x, g.x, W, 0, W);
    along('govY', g.y1 - g.G.R, g.y2 + g.G.R, D, g.G.R, D - (g.y2 - g.y1) - g.G.R);
  }
  return [...out.values()];
}
