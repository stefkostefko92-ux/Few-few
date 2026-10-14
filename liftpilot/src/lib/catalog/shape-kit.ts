// The pieces the makers' machines as they are are built of (src/shaft/machine-shape.ts): boxes, cylinders along an axis,
// a gearbox arched over its wheel seen along Z, a part mirrored across the machine's vertical plane, the rows of the
// sheet's sheave table and the grid of the feet's holes. Millimetres, the machine's own frame. Pure.
import type { ShapePart, ShapeRole } from '@/shaft/machine-shape';

export const B = (role: ShapeRole, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): ShapePart => ({ role, box: [x0, y0, z0, x1, y1, z1] });
/** a cylinder along X at height y, across z */
export const CX = (role: ShapeRole, y: number, z: number, r: number, x0: number, x1: number): ShapePart => ({ role, cyl: 'x', at: [y, z], r, span: [x0, x1] });
/** a cylinder along Z at (x, y); an output shaft ends inside the sheave's hub, at P + E/2 */
export const CZ = (role: ShapeRole, x: number, y: number, r: number, z0: number, z1: number): ShapePart => ({ role, cyl: 'z', at: [x, y], r, span: [z0, z1] });
/** a cylinder along Y at (x, z) */
export const CY = (role: ShapeRole, x: number, z: number, r: number, y0: number, y1: number): ShapePart => ({ role, cyl: 'y', at: [x, z], r, span: [y0, y1] });
/** the gearbox of the large machines seen along Z: straight sides from y0 to the wheel's axis yc, an arch of radius R
 *  over it, centred on the axis; the side toward the motor reaches x1 */
export const arch = (x0: number, x1: number, y0: number, yc: number, R: number, z0: number, z1: number): ShapePart => {
  const pts: [number, number][] = [[x0, y0], [x1, y0], [x1, yc]];
  for (let i = 0; i <= 16; i++) pts.push([R * Math.cos((Math.PI * i) / 16), yc + R * Math.sin((Math.PI * i) / 16)]);
  pts.push([x0, yc]);
  return { role: 'housing', prism: pts, span: [z0, z1] };
};
/** the parts of both sides of the machine's vertical plane: a box mirrored across it */
export const pair = (role: ShapeRole, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): ShapePart[] => [B(role, x0, y0, z0, x1, y1, z1), B(role, x0, y0, -z1, x1, y1, -z0)];
/** the sheet's sheave table "D/E/P" (P defaults to the row's), as [D, P, E] */
export const rows = (P: number, list: string): (readonly [number, number, number])[] => list.split(' ').map((s) => {
  const [D, E, p] = s.split('/').map(Number);
  return [D, p ?? P, E] as const;
});
export const grid = (xs: readonly number[], zs: readonly number[]): [number, number][] => xs.flatMap((x) => zs.map((z) => [x, z] as [number, number]));
