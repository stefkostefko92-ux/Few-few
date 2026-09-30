// Plan drawing of a layout as simple primitives in millimetres (plan coordinates, see types.ts): the same list feeds
// the preview (SVG), the DXF export and the report. Walls are schematic, 200 mm around the clear shaft; rails are
// drawn as T profiles (car 89 × 62 mm, counterweight 50 × 40 mm) with their brackets. Pure.
import type { Layout, Rail } from './types';

export type PlanLayer = 'MURI' | 'VANO' | 'CABINA' | 'PORTE' | 'GUIDE' | 'CONTRAPPESO' | 'QUOTE' | 'TESTI';
export type Pt = readonly [number, number];
export type Fill = 'wall' | 'car' | 'cw' | 'steel' | 'door';

export type Prim =
  | { k: 'poly'; layer: PlanLayer; pts: Pt[]; closed: boolean; fill?: Fill }
  | { k: 'line'; layer: PlanLayer; a: Pt; b: Pt }
  | { k: 'text'; layer: PlanLayer; at: Pt; h: number; text: string; align: 'l' | 'c' | 'r'; vertical?: boolean }
  /** linear dimension from a to b, drawn at `off` millimetres to the left of the direction a → b */
  | { k: 'dim'; layer: 'QUOTE'; a: Pt; b: Pt; off: number; text: string };

export interface PlanLabels {
  car: string;
  counterweight: string;
  persons: string;
  doorT2: string;
  doorC2: string;
  title: string;
}

export type DimPrim = Extract<Prim, { k: 'dim' }>;

/**
 * A dimension as lines and one text: extension lines, the dimension line, 45° ticks, and the value above the line
 * in its reading direction (rotated by `angle` radians, never upside down). Shared by the preview, the DXF and the PDF.
 */
export function explodeDim(p: DimPrim): { lines: [Pt, Pt][]; text: { at: Pt; angle: number; value: string; h: number } } {
  const [ax, ay] = p.a, [bx, by] = p.b, len = Math.hypot(bx - ax, by - ay) || 1;
  const dx = (bx - ax) / len, dy = (by - ay) / len, nx = -dy, ny = dx; // left of a → b
  const a2: Pt = [ax + nx * p.off, ay + ny * p.off], b2: Pt = [bx + nx * p.off, by + ny * p.off];
  const over = Math.sign(p.off) * 30, tick = 18;
  const lines: [Pt, Pt][] = [
    [p.a, [a2[0] + nx * over, a2[1] + ny * over]], [p.b, [b2[0] + nx * over, b2[1] + ny * over]], [a2, b2],
    ...[a2, b2].map(([x, y]): [Pt, Pt] => [[x - (dx + nx) * tick, y - (dy + ny) * tick], [x + (dx + nx) * tick, y + (dy + ny) * tick]]),
  ];
  const angle = Math.atan2(dy, dx), read = angle > Math.PI / 2 + 1e-9 || angle <= -Math.PI / 2 + 1e-9 ? angle + Math.PI : angle;
  const at: Pt = [(a2[0] + b2[0]) / 2 - Math.sin(read) * 18, (a2[1] + b2[1]) / 2 + Math.cos(read) * 18];
  return { lines, text: { at, angle: read, value: p.text, h: 42 } };
}

export interface Drawing {
  prims: Prim[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

const T = 200; // schematic wall thickness
const mm = (x: number): string => String(Math.round(x));
const rect = (layer: PlanLayer, x0: number, y0: number, x1: number, y1: number, fill?: Fill): Prim =>
  ({ k: 'poly', layer, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, fill });

/** T profile with the blade tip at the rail point, and the bracket from its flange to the wall. */
function rail(r: Rail): Prim[] {
  const [b, h, tf, k] = r.size === 'car' ? [89, 62, 10, 16] : [50, 40, 6, 6];
  const local: Pt[] = [[0, -k / 2], [0, k / 2], [-(h - tf), k / 2], [-(h - tf), b / 2], [-h, b / 2], [-h, -b / 2], [-(h - tf), -b / 2], [-(h - tf), -k / 2]];
  const [ux, uy] = r.dir === 'right' ? [1, 0] : r.dir === 'left' ? [-1, 0] : r.dir === 'back' ? [0, 1] : [0, -1];
  const at = (u: number, v: number): Pt => [r.x + u * ux - v * uy, r.y + u * uy + v * ux];
  const back = at(-h, 0);
  const out: Prim[] = [{ k: 'poly', layer: 'GUIDE', pts: local.map(([u, v]) => at(u, v)), closed: true, fill: 'steel' }];
  const w = r.size === 'car' ? 30 : 22;
  if (r.bracketAxis === 'x') {
    const x0 = r.dir === 'right' || r.dir === 'left' ? back[0] : r.x;
    out.push(rect('GUIDE', Math.min(x0, r.bracketTo), back[1] - w, Math.max(x0, r.bracketTo), back[1] + w));
  } else {
    const y0 = r.dir === 'back' || r.dir === 'front' ? back[1] : r.y;
    out.push(rect('GUIDE', back[0] - w, Math.min(y0, r.bracketTo), back[0] + w, Math.max(y0, r.bracketTo)));
  }
  return out;
}

export function drawPlan(L: Layout, labels: PlanLabels): Drawing {
  const { W, D, landingDepth, sillGap, carWall, cw: cwSide } = L.inputs;
  const { car, carInner: ci, door, cw } = L;
  const P: Prim[] = [];
  // walls, with the landing opening in the front wall
  P.push(rect('MURI', -T, -T, 0, D + T, 'wall'), rect('MURI', W, -T, W + T, D + T, 'wall'), rect('MURI', 0, D, W, D + T, 'wall'));
  if (door.x0 > 0) P.push(rect('MURI', 0, -T, door.x0, 0, 'wall'));
  if (door.x1 < W) P.push(rect('MURI', door.x1, -T, W, 0, 'wall'));
  P.push({ k: 'poly', layer: 'VANO', pts: [[0, 0], [W, 0], [W, D], [0, D]], closed: true });

  // landing door: frame with the stacking space, sill and panels (closed); car door the same, on the car sill
  const panels = (y: number, gap: number): Prim[] => {
    const lap = 20, mid = (door.x0 + door.x1) / 2;
    if (door.kind === 'C2') return [rect('PORTE', door.x0 - lap, y, mid, y + 18, 'door'), rect('PORTE', mid, y, door.x1 + lap, y + 18, 'door')];
    const half = door.width / 2 + lap;
    return door.stack === 'right'
      ? [rect('PORTE', door.x0 - lap, y + gap, door.x0 + half, y + gap + 16, 'door'), rect('PORTE', door.x1 - half, y, door.x1 + lap, y + 16, 'door')]
      : [rect('PORTE', door.x0 - lap, y, door.x0 + half, y + 16, 'door'), rect('PORTE', door.x1 - half, y + gap, door.x1 + lap, y + gap + 16, 'door')];
  };
  P.push({ k: 'line', layer: 'PORTE', a: [door.frame0, landingDepth - 60], b: [door.frame1, landingDepth - 60] });
  P.push({ k: 'line', layer: 'PORTE', a: [door.frame0, 0], b: [door.frame0, landingDepth - 60] }, { k: 'line', layer: 'PORTE', a: [door.frame1, 0], b: [door.frame1, landingDepth - 60] });
  P.push(rect('PORTE', door.x0 - 40, landingDepth - 10, door.x1 + 40, landingDepth), ...panels(landingDepth - 52, 20));
  const carSill = landingDepth + sillGap;
  P.push(rect('PORTE', door.x0 - 30, carSill, door.x1 + 30, carSill + 10), ...panels(carSill + 14, 20));

  // car walls, with the entrance in the front wall
  P.push(rect('CABINA', car.x, car.y, ci.x, car.y + car.h, 'car'), rect('CABINA', ci.x + ci.w, car.y, car.x + car.w, car.y + car.h, 'car'));
  P.push(rect('CABINA', ci.x, ci.y + ci.h, ci.x + ci.w, car.y + car.h, 'car'));
  if (door.x0 > ci.x) P.push(rect('CABINA', ci.x, car.y, door.x0, ci.y, 'car'));
  if (door.x1 < ci.x + ci.w) P.push(rect('CABINA', door.x1, car.y, ci.x + ci.w, ci.y, 'car'));
  const cx = ci.x + ci.w / 2, cy = ci.y + ci.h / 2, th = Math.max(45, Math.min(70, ci.w / 16));
  P.push({ k: 'text', layer: 'TESTI', at: [cx, cy + th * 0.9], h: th, text: `${labels.car} ${mm(L.A)} × ${mm(L.B)}`, align: 'c' });
  P.push({ k: 'text', layer: 'TESTI', at: [cx, cy - th * 0.9], h: th * 0.8, text: `${mm(L.Q)} kg · ${L.persons} ${labels.persons}`, align: 'c' });

  // counterweight: frame with the usual cross
  P.push(rect('CONTRAPPESO', cw.x, cw.y, cw.x + cw.w, cw.y + cw.h, 'cw'));
  P.push({ k: 'line', layer: 'CONTRAPPESO', a: [cw.x, cw.y], b: [cw.x + cw.w, cw.y + cw.h] }, { k: 'line', layer: 'CONTRAPPESO', a: [cw.x, cw.y + cw.h], b: [cw.x + cw.w, cw.y] });
  // the label inside the frame, along its length
  const ch = Math.min(40, (cwSide === 'rear' ? cw.h : cw.w) * 0.45);
  if (cwSide === 'rear') P.push({ k: 'text', layer: 'TESTI', at: [cw.x + cw.w / 2, cw.y + cw.h / 2 - ch * 0.35], h: ch, text: labels.counterweight, align: 'c' });
  else P.push({ k: 'text', layer: 'TESTI', at: [cw.x + cw.w / 2 + ch * 0.35, cw.y + cw.h / 2], h: ch, text: labels.counterweight, align: 'c', vertical: true });
  for (const r of L.rails) P.push(...rail(r));

  // dimensions: shaft, car inside, door clear width, clearances in front of the car
  P.push({ k: 'dim', layer: 'QUOTE', a: [0, -T], b: [W, -T], off: -170, text: mm(W) });
  P.push({ k: 'dim', layer: 'QUOTE', a: [W + T, 0], b: [W + T, D], off: -170, text: mm(D) });
  P.push({ k: 'dim', layer: 'QUOTE', a: [ci.x, ci.y + ci.h], b: [ci.x + ci.w, ci.y + ci.h], off: -110, text: mm(L.A) });
  P.push({ k: 'dim', layer: 'QUOTE', a: [ci.x, ci.y], b: [ci.x, ci.y + ci.h], off: -110, text: mm(L.B) });
  P.push({ k: 'dim', layer: 'QUOTE', a: [door.x0, -T], b: [door.x1, -T], off: -60, text: `${door.kind === 'T2' ? labels.doorT2 : labels.doorC2} ${mm(door.width)}` });
  P.push({ k: 'dim', layer: 'QUOTE', a: [-T, 0], b: [-T, car.y + carWall], off: 120, text: mm(car.y + carWall) });
  P.push({ k: 'text', layer: 'TESTI', at: [-T, -T - 330], h: 50, text: labels.title, align: 'l' });

  return { prims: P, bounds: { minX: -T - 330, minY: -T - 400, maxX: W + T + 330, maxY: D + T + 120 } };
}
