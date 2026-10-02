// The worm-geared machine drawn as the 3D builds it (components/machine/parts: the machine of example A, sheave Ø 560,
// scaled to the sheave of the calculation): the bedplate's two I-beams on their anti-vibration mounts, the gearbox's
// cast housing with the round wheel covers and the worm's bearing caps, the sheave in front of it, the drum brake
// between gearbox and motor with its arms and magnet, the finned motor with its end shields, fan cover and terminal
// box, the handwheel on the shaft's end. The machine's own axes in metres at Ø 560: X along the worm (the motor toward
// +X), Y up from the bedplate's underside, Z along the wheel's axis (the sheave toward +Z). Pure: room-view.ts places it.
import { circle, line, path, type Entity, type Pt } from '../drawing';

/** Where the sheave's axis is in the machine's frame, and its pitch radius, at Ø 560 [m]. */
export const MACHINE_A = { yWheel: 0.5, zSheave: 0.34, rp: 0.28, yWorm: 0.34 } as const;

type Box3 = readonly [number, number, number, number]; // a0, b0, a1, b1 in the view's two axes [m]

/** The machine seen along Z (the sheave face-on): `at` maps (x, y) of the machine [m] to the drawing. */
export function machineElevation(at: (x: number, y: number) => Pt): Entity[] {
  const out: Entity[] = [], { yWheel: yw, yWorm: yv, rp } = MACHINE_A;
  const box = ([x0, y0, x1, y1]: Box3, st: 'outline' | 'thin' = 'outline', fill?: 'paper' | 'steel' | 'cw'): void => {
    out.push(path([at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)], true, st, fill));
  };
  const ring = (x: number, y: number, r: number, st: 'outline' | 'thin' = 'thin', fill?: 'paper' | 'steel'): void => {
    const [cx, cy] = at(x, y), [ex] = at(x + r, y);
    out.push(circle([cx, cy], Math.abs(ex - cx), st, fill));
  };
  // the bedplate: the I-beam's web between its flanges, the cross members, the mounts
  box([-0.46, 0.02, 1.06, 0.14], 'outline', 'cw');
  for (const y of [0.03, 0.13]) out.push(line(at(-0.46, y), at(1.06, y), 'thin'));
  for (const x of [-0.52, 1.06]) box([x, 0.03, x + 0.06, 0.13]);
  for (const x of [-0.36, 0.95]) box([x - 0.06, 0, x + 0.06, 0.02], 'thin', 'steel');
  // the gearbox: its foot, the housing (the worm's chamber below, the wheel's round chamber over it), the bearing caps
  box([-0.2, 0.14, 0.2, 0.175]);
  const arc: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    arc.push(at(0.188 * Math.cos(a), yw + 0.188 * Math.sin(a)));
  }
  out.push(path([at(-0.2, 0.175), at(0.2, 0.175), at(0.2, yw), ...arc, at(-0.2, yw)], true, 'outline', 'paper'));
  for (const s of [-1, 1]) box([s > 0 ? 0.196 : -0.235, yv - 0.075, s > 0 ? 0.235 : -0.196, yv + 0.075], 'outline', 'paper');
  ring(0, yw, 0.17);
  // the brake between gearbox and motor: drum, the two arms from their pivot to the magnet, the spring rod
  box([0.24, yv - 0.12, 0.35, yv + 0.12], 'outline', 'steel');
  for (const x of [0.235, 0.34]) box([x, 0.2, x + 0.015, 0.585]);
  box([0.255, 0.585, 0.335, 0.66], 'outline', 'paper');
  out.push(line(at(0.22, 0.5), at(0.37, 0.5), 'thin'));
  // the motor: end shields, the finned frame, the fan cover, the shaft's end, the terminal box on top, the feet
  box([0.356, yv - 0.145, 0.386, yv + 0.145]);
  box([0.386, yv - 0.15, 0.736, yv + 0.15], 'outline', 'paper');
  for (let x = 0.41; x < 0.72; x += 0.03) out.push(line(at(x, yv - 0.15), at(x, yv + 0.15), 'fine'));
  box([0.736, yv - 0.138, 0.766, yv + 0.138]);
  box([0.766, yv - 0.133, 0.9055, yv + 0.133], 'outline', 'paper');
  box([0.9055, yv - 0.022, 0.965, yv + 0.022], 'thin', 'steel');
  box([0.4575, yv + 0.126, 0.6025, yv + 0.21], 'outline', 'paper');
  for (const x of [0.445, 0.68]) box([x - 0.0425, 0.14, x + 0.0425, yv - 0.126], 'thin');
  // the handwheel on the shaft's end, edge-on
  box([0.965, yv - 0.2, 0.985, yv + 0.2], 'outline', 'paper');
  // the sheave in front: its rim with the grooves' bottom, the web's lightening holes, the hub
  ring(0, yw, rp + 0.012, 'outline', 'paper');
  ring(0, yw, rp - 0.006);
  ring(0, yw, 0.236);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * 2 * Math.PI + Math.PI / 6;
    ring(0.16 * Math.cos(a), yw + 0.16 * Math.sin(a), 0.045);
  }
  ring(0, yw, 0.075, 'outline', 'steel');
  return out;
}

/** The machine seen from above: `at` maps (x, z) of the machine [m] to the drawing. */
export function machinePlan(at: (x: number, z: number) => Pt): Entity[] {
  const out: Entity[] = [], { zSheave: zs, rp } = MACHINE_A;
  const box = ([x0, z0, x1, z1]: Box3, st: 'outline' | 'thin' = 'outline', fill?: 'paper' | 'steel' | 'cw'): void => {
    out.push(path([at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)], true, st, fill));
  };
  // the bedplate: two I-beams' top flanges, the cross members, the mounts' plates
  for (const z of [-0.16, 0.16]) {
    box([-0.46, z - 0.035, 1.06, z + 0.035], 'outline', 'cw');
    out.push(line(at(-0.46, z), at(1.06, z), 'fine'));
  }
  for (const x of [-0.52, 1.06]) box([x, -0.2, x + 0.06, 0.2]);
  // the gearbox with its wheel covers, the output boss toward the sheave, the rear bearing cap, the worm's caps
  box([-0.2, -0.145, 0.2, 0.145], 'outline', 'paper');
  box([-0.17, 0.145, 0.17, 0.165], 'thin');
  box([-0.17, -0.165, 0.17, -0.145], 'thin');
  box([-0.105, 0.165, 0.105, 0.2], 'thin');
  box([-0.074, -0.189, 0.074, -0.165], 'thin');
  for (const s of [-1, 1]) box([s > 0 ? 0.196 : -0.235, -0.075, s > 0 ? 0.235 : -0.196, 0.075], 'thin');
  // the sheave over the bedplate's side: its rim and the grooves of the ropes
  box([-(rp + 0.012), zs - 0.05, rp + 0.012, zs + 0.05], 'outline', 'steel');
  for (let k = -1.5; k <= 1.5; k += 1) out.push(line(at(-(rp + 0.006), zs + k * 0.018), at(rp + 0.006, zs + k * 0.018), 'fine'));
  box([-0.085, 0.2, 0.085, zs - 0.05], 'thin');
  // the brake: drum, the arms each side, the magnet over it
  box([0.24, -0.12, 0.35, 0.12], 'outline', 'steel');
  for (const z of [-0.152, 0.152]) box([0.235, z - 0.012, 0.355, z + 0.012], 'thin');
  box([0.255, -0.06, 0.335, 0.06], 'thin');
  // the motor: shields, finned frame, fan cover, shaft's end, terminal box; the handwheel edge-on
  box([0.356, -0.145, 0.386, 0.145]);
  box([0.386, -0.15, 0.736, 0.15], 'outline', 'paper');
  for (let z = -0.12; z <= 0.121; z += 0.04) out.push(line(at(0.386, z), at(0.736, z), 'fine'));
  box([0.736, -0.138, 0.766, 0.138]);
  box([0.766, -0.133, 0.9055, 0.133], 'outline', 'paper');
  box([0.9055, -0.022, 0.965, 0.022], 'thin', 'steel');
  box([0.4575, -0.0675, 0.6025, 0.0675], 'thin', 'paper');
  box([0.965, -0.2, 0.985, 0.2], 'outline', 'paper');
  return out;
}

/** The machine's footprint [m]: along X the bedplate's cross members end to end, along Z from the mounts' plates to
 *  the sheave's outer face. */
export const MACHINE_X: readonly [number, number] = [-0.52, 1.12];
export const MACHINE_Z: readonly [number, number] = [-0.2, MACHINE_A.zSheave + 0.05];

/** The generic machine's top over its bedplate's underside, at Ø 560 [m]: the highest point of its elevation. */
export const MACHINE_TOP: number = machineElevation((x, y) => [x, y]).reduce((top, e) => Math.max(top,
  e.e === 'path' ? Math.max(...e.pts.map((p) => p[1])) : e.e === 'line' ? Math.max(e.a[1], e.b[1]) : e.e === 'circle' || e.e === 'arc' ? e.c[1] + e.r : top), 0);
