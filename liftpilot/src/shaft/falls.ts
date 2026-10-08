// Where the ropes rise from the car and from the counterweight to the machine (registry impianto.dx): with 1:1
// roping from their centres; with 2:1 each part turns its rope round its own pulley, which turns in the plane between
// its guide rails — the car's in its crosshead, the counterweight's in its frame, along its long side — so the rope
// rises at one side of the pulley and its dead end hangs over the other, half the pulley from the centre (never in the
// thin direction of the counterweight: a pulley there would reach into the wall behind it and into the car's travel).
// The sides are the pair whose falls' line runs most nearly along the centres' (with the two planes parallel, along
// it: the machine straight, set aside by half a pulley). Plan in the shaft's axes [mm]. Pure.
import type { Layout } from './types';

type P2 = readonly [number, number];

export interface Falls {
  /** where the rope rises to the machine from the car and from the counterweight */
  car: P2;
  cw: P2;
  /** 2:1: where each dead end hangs, and the unit direction its pulley turns in (from the dead end to the fall); none
   *  with 1:1 */
  dead: readonly { at: P2; dir: P2 }[];
}

const unit = (a: P2, b: P2): P2 => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return l > 1e-9 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : [1, 0];
};

/** The plane a part's pulley turns in: along the line through its two guide rails' tips. */
function railLine(L: Layout, kind: 'car' | 'cw'): P2 {
  const r = L.rails.filter((x) => x.kind === kind);
  return r.length >= 2 ? unit([r[0].x, r[0].y], [r[1].x, r[1].y]) : [1, 0];
}

/** The falls of layout `L` at roping `roping`, its 2:1 pulleys of diameter `Dp` [mm]. */
export function fallsOf(L: Layout, roping: number, Dp: number): Falls {
  const car: P2 = [L.car.x + L.car.w / 2, L.car.y + L.car.h / 2], cw: P2 = [L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2];
  if (roping !== 2 || Dp <= 0) return { car, cw, dead: [] };
  const r = Dp / 2, ec = railLine(L, 'car'), ew = railLine(L, 'cw'), [ux, uy] = unit(car, cw);
  const at = (c: P2, e: P2, s: number): P2 => [c[0] + s * r * e[0], c[1] + s * r * e[1]];
  // the pair of sides whose falls' line is nearest the centres' (the least sine of the angle between them), the first on a tie
  let best = { sc: 1, sw: 1, sin: Infinity };
  for (const sc of [1, -1]) for (const sw of [1, -1]) {
    const [ax, ay] = unit(at(car, ec, sc), at(cw, ew, sw)), sin = Math.abs(ax * uy - ay * ux);
    if (sin < best.sin - 1e-9) best = { sc, sw, sin };
  }
  const pc = at(car, ec, best.sc), pw = at(cw, ew, best.sw), dc = at(car, ec, -best.sc), dw = at(cw, ew, -best.sw);
  return { car: pc, cw: pw, dead: [{ at: dc, dir: unit(dc, pc) }, { at: dw, dir: unit(dw, pw) }] };
}
