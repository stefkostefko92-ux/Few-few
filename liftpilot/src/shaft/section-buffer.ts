// A pit buffer in section A-A, standing on its base (plinth and support): a spring, a polyurethane pad (dashed where
// it is fully compressed, at 90 % of its height) or a hydraulic buffer with its plunger. Model entities.
import { line, path, type Entity, type Pt } from '../drawing';
import type { BufferType } from './vertical';

export function buffer(P: (x: number, z: number) => Pt, x: number, floor: number, base: number, h: number, type: BufferType): Entity[] {
  const out: Entity[] = [], w = 90, zb = floor + base, box = (a: number, z0: number, b: number, z1: number, st: 'outline' | 'thin', fill?: 'steel' | 'paper'): Entity =>
    path([P(a, z0), P(b, z0), P(b, z1), P(a, z1)], true, st, fill);
  if (base > 0) out.push(path([P(x - w, floor), P(x + w, floor), P(x + w, zb), P(x - w, zb)], true, 'outline', base > 350 ? 'concrete' : 'steel'));
  if (type === 'pu') {
    // a polyurethane pad: a cylinder on its plate, the top rounded off; dashed where it is fully compressed
    const top = zb + h, r = 60;
    out.push(box(x - 75, zb, x + 75, zb + 8, 'outline', 'steel'));
    out.push(path([P(x - r, zb + 8), P(x + r, zb + 8), P(x + r, top - 18), P(x + r - 18, top), P(x - r + 18, top), P(x - r, top - 18)], true, 'outline', 'paper'));
    out.push(line(P(x - r - 15, zb + 0.1 * h), P(x + r + 15, zb + 0.1 * h), 'hidden'));
    return out;
  }
  if (type === 'oil') {
    // a hydraulic buffer: the cylinder, the plunger out of it and its striking pad
    const body = zb + 0.58 * h;
    out.push(box(x - 55, zb, x + 55, body, 'outline', 'steel'), box(x - 28, body, x + 28, zb + h - 22, 'outline', 'paper'), box(x - 62, zb + h - 22, x + 62, zb + h, 'outline', 'steel'));
    return out;
  }
  const turns = Math.max(3, Math.round(h / 45)), pts: Pt[] = [P(x - 45, zb)];
  for (let i = 1; i <= turns; i++) pts.push(P(i % 2 ? x + 45 : x - 45, zb + (h - 20) * (i / turns)));
  out.push(path(pts, false, 'thin'), path([P(x - 60, zb + h - 20), P(x + 60, zb + h - 20), P(x + 60, zb + h), P(x - 60, zb + h)], true, 'outline', 'steel'));
  return out;
}
