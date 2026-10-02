// A maker's machine drawn as the 3D builds it (machine-shape.ts; components/machine/shape): seen along Z with the sheave
// face-on, and from above. The bedframe of ours under the feet, the parts back to front (from above: low to high), each
// a box, a cylinder or the gearbox's outline, the motor's fins, the handwheel and the brake drum edge-on, the sheave
// with its grooves and three spokes; from above the feet's holes. Millimetres of the machine's frame, the bedframe's
// underside at y = 0; `at` maps them to the drawing. Pure: room-view.ts places it.
import { circle, line, path, type Entity, type Pt } from '../drawing';
import { partBox, type MachineFrame, type ShapePart } from './machine-shape';

/** The bedframe seen along Z: the beam, the posts down to the mounts when it is tall, the mounts. */
function bedElevation(F: MachineFrame, at: (x: number, y: number) => Pt): Entity[] {
  const out: Entity[] = [], hb = Math.min(120, F.bed - 22), y0 = F.bed - hb, [x0, x1] = F.x;
  const box = (a: number, b: number, c: number, d: number, st: 'outline' | 'thin' = 'outline', fill?: 'cw' | 'steel' | 'paper'): void => {
    out.push(path([at(a, b), at(c, b), at(c, d), at(a, d)], true, st, fill));
  };
  box(x0, y0, x1, F.bed, 'outline', 'cw');
  for (const y of [y0 + 9, F.bed - 9]) out.push(line(at(x0, y), at(x1, y), 'thin'));
  for (const x of F.mounts) {
    if (y0 - 22 > 4) box(x - 40, 22, x + 40, y0);
    box(x - 60, 0, x + 60, 22, 'thin', 'steel');
  }
  return out;
}

/** The machine seen along Z (the sheave face-on, toward +Z): the bedframe, the parts from the back, the sheave. */
export function shapeElevation(F: MachineFrame, D: number, at: (x: number, y: number) => Pt): Entity[] {
  const S = F.shape;
  if (!S) return [];
  const out = bedElevation(F, at), y = (v: number): number => v + F.bed;
  const box = (x0: number, y0: number, x1: number, y1: number, st: 'outline' | 'thin' = 'outline', fill: 'paper' | 'steel' | 'dark' = 'paper'): void => {
    out.push(path([at(x0, y(y0)), at(x1, y(y0)), at(x1, y(y1)), at(x0, y(y1))], true, st, fill));
  };
  const ring = (cx: number, cy: number, r: number, st: 'outline' | 'thin' = 'outline', fill?: 'paper' | 'steel'): void => {
    const [px, py] = at(cx, y(cy)), [ex] = at(cx + r, y(cy));
    out.push(circle([px, py], Math.abs(ex - px), st, fill));
  };
  const back = [...S.parts].sort((a, b) => partBox(a)[5] - partBox(b)[5]);
  for (const p of back) drawElevation(p, box, ring, out, at, y);
  // the sheave in front: rim, the grooves' bottom, the rim's inside, three spokes, the hub
  const R = D / 2, rIn = R - Math.max(32, 0.09 * R), rh = Math.max(55, 0.2 * R);
  ring(0, S.yWheel, R + 6, 'outline', 'paper');
  ring(0, S.yWheel, R - 6, 'thin');
  ring(0, S.yWheel, rIn, 'thin');
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a), n = [-s, c];
    for (const side of [-1, 1]) {
      const w0 = 0.42 * rh, w1 = 0.5 * rh;
      out.push(line(at(c * rh + side * n[0] * w0, y(S.yWheel + s * rh + side * n[1] * w0)), at(c * rIn + side * n[0] * w1, y(S.yWheel + s * rIn + side * n[1] * w1)), 'thin'));
    }
  }
  ring(0, S.yWheel, rh, 'outline', 'paper');
  ring(0, S.yWheel, 0.62 * rh, 'thin', 'steel');
  return out;
}

function drawElevation(p: ShapePart, box: (x0: number, y0: number, x1: number, y1: number, st?: 'outline' | 'thin', fill?: 'paper' | 'steel' | 'dark') => void,
  ring: (cx: number, cy: number, r: number, st?: 'outline' | 'thin', fill?: 'paper' | 'steel') => void, out: Entity[], at: (x: number, y: number) => Pt, y: (v: number) => number): void {
  const steel = p.role === 'brake' || p.role === 'shaft' || p.role === 'magnet';
  if ('prism' in p) {
    out.push(path(p.prism.map(([px, py]) => at(px, y(py))), true, 'outline', 'paper'));
    return;
  }
  if ('box' in p) {
    const [x0, y0, , x1, y1] = p.box;
    box(x0, y0, x1, y1, 'outline', steel ? 'steel' : 'paper');
    if (p.role === 'motor') for (let v = y0 + 28; v < y1 - 10; v += 28) out.push(line(at(x0 + 10, y(v)), at(x1 - 10, y(v)), 'fine'));
    if (p.role === 'terminal') out.push(line(at(x0, y(y1 - 12)), at(x1, y(y1 - 12)), 'thin'));
    return;
  }
  const [a, b] = p.at, r = p.r, [s0, s1] = p.span;
  if (p.cyl === 'z') {
    ring(a, b, r, 'outline', steel ? 'steel' : 'paper');
    return;
  }
  if (p.cyl === 'y') {
    if (p.role === 'eye') {
      box(a - r, s0, a + r, s0 + 12, 'thin');
      ring(a, s1 - (s1 - s0 - 12) / 2, (s1 - s0 - 12) / 2, 'thin');
    } else box(a - r, s0, a + r, s1);
    return;
  }
  box(s0, a - r, s1, a + r, 'outline', steel ? 'steel' : 'paper');
  if (p.role === 'motor') for (let v = a - r + 22; v < a + r - 10; v += 22) out.push(line(at(s0 + 10, y(v)), at(s1 - 10, y(v)), 'fine'));
  if (p.role === 'handwheel') out.push(line(at((s0 + s1) / 2, y(a - r)), at((s0 + s1) / 2, y(a + r)), 'thin'));
}

/** The machine from above (toward −Y): the bedframe's beams, the parts from the lowest, the sheave with its grooves, the
 *  feet's holes (seen through the base when it has one; hidden under a compact gearbox). */
export function shapePlan(F: MachineFrame, D: number, n: number, d: number, at: (x: number, z: number) => Pt): Entity[] {
  const S = F.shape;
  if (!S) return [];
  const out: Entity[] = [], quad = (x0: number, z0: number, x1: number, z1: number, st: 'outline' | 'thin' | 'hidden' = 'outline', fill?: 'paper' | 'steel' | 'cw'): void => {
    out.push(path([at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)], true, st, fill));
  };
  for (const z of F.beams) quad(F.x[0], z - 35, F.x[1], z + 35, 'outline', 'cw');
  for (const x of [F.x[0], F.x[1] - 70]) quad(x, F.beams[0] + 35, x + 70, F.beams[1] - 35, 'thin', 'cw');
  const low = [...S.parts].sort((a, b) => partBox(a)[4] - partBox(b)[4]);
  for (const p of low) {
    const [x0, , z0, x1, , z1] = partBox(p), steel = p.role === 'brake' || p.role === 'shaft' || p.role === 'magnet';
    if ('cyl' in p && p.cyl === 'y') {
      const [cx, cz] = at(p.at[0], p.at[1]), [ex] = at(p.at[0] + p.r, p.at[1]);
      out.push(circle([cx, cz], Math.abs(ex - cx), 'outline', 'paper'));
      continue;
    }
    quad(x0, z0, x1, z1, 'outline', steel ? 'steel' : 'paper');
    if (p.role === 'motor') for (let z = z0 + 24; z < z1 - 10; z += 24) out.push(line(at(x0 + 10, z), at(x1 - 10, z), 'fine'));
  }
  const base = S.parts.some((p) => p.role === 'base');
  for (const [hx, hz] of S.holes) {
    const [cx, cz] = at(hx, hz), [ex] = at(hx + 11, hz);
    out.push(circle([cx, cz], Math.abs(ex - cx), base ? 'thin' : 'hidden'));
  }
  // the sheave over the side: its rim and the grooves of the ropes
  const R = F.zSheave, half = F.width / 2, rs = D / 2 + 6, pitch = Math.min(Math.max(d + 6, 1.7 * d), (F.width - 12) / n);
  quad(-rs, R - half, rs, R + half, 'outline', 'steel');
  for (let i = 0; i < n; i++) {
    const z = R - (n * pitch) / 2 + pitch * (i + 0.5);
    out.push(line(at(-rs + 6, z), at(rs - 6, z), 'fine'));
  }
  return out;
}
