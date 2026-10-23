// The geared machines of Montanari as they are (src/shaft/machine-shape.ts), from the dimensioned drawings of the maker's
// range sheets the client supplied on 3 October 2026 (Montanari Gearbox M65, M73, M75; schede M93-M95 and M98 Rev
// 21_05_24): the sheave's axis over the feet, the overall sizes, the feet and their holes, the sheave's mid-plane P (the
// holes' row plus the sheet's A) and width, the outboard support of the S versions, the flywheel's diameter. The worm's
// axis is not dimensioned on these sheets: it is read on the drawing in scale (the flywheel's centre), as are where the
// gearbox, the drum brake, the motor and its terminal box stand (±10 mm). Only dimensions: the parts are our own boxes
// and cylinders. The H versions (high static load, no support) keep their base model's body; the long-shaft (AL), the
// vertical PENTA and the models without a sheet supplied (M83, M85, M105, M109) keep the generic machine. Pure.
import type { MachineShape, ShapePart } from '@/shaft/machine-shape';
import { B, CX, CY, CZ, grid, pair, rows } from './shape-kit';

/** One gearbox of the M range: the box over the wheel with the worm above it, round covers on its faces, the drum brake
 *  between it and the motor flanged along the worm, the flywheel at the motor's end. */
interface Range {
  yWheel: number; yWorm: number; feet: [number, number, number, number]; holes: [number, number][]; hole: string; base: number;
  overall: [number, number, number];
  /** the box: its right end, top and half-width; the wheel's covers: radius, the front one's thickness (0: none) */
  box: [number, number, number]; covers: [number, number];
  brake: [number, number, number]; levers: [number, number, number, number, number, number]; magnet: [number, number, number, number, number];
  /** the hand release lever: from x0 to x1, up to its top (the overall height but on the M98's, under the fan) */
  handle: [number, number, number];
  motor: [number, number, number]; terminal: [number, number, number, number]; flywheel: [number, number, number];
  /** the forced ventilation's unit on the motor (M98): x0, x1, its top, half-width */
  fan?: [number, number, number, number];
  eye?: [number, number];
}

function body(r: Range, end: number): ShapePart[] {
  const [bx1, top, bz] = r.box, [rc, front] = r.covers, y = r.yWorm, L = r.overall[0];
  const [lx0, lx1, ly0, ly1, zi, zo] = r.levers, [mx0, mx1, my0, my1, mz] = r.magnet, [tx0, tx1, ty1, tz] = r.terminal;
  return [
    B('base', r.feet[0], 0, Math.max(r.feet[1], -bz - 40), r.feet[2], r.base, Math.min(r.feet[3], bz + 40)),
    B('housing', -L, r.base, -bz, bx1, top, bz),
    CZ('cover', 0, r.yWheel, rc, -bz - 16, -bz),
    ...(front ? [CZ('cover', 0, r.yWheel, rc, bz, bz + front)] : []),
    CZ('shaft', 0, r.yWheel, Math.round(rc * 0.38), bz + front, end),
    CX('brake', y, 0, r.brake[0], r.brake[1], r.brake[2]), ...pair('arm', lx0, ly0, zi, lx1, ly1, zo), B('magnet', mx0, my0, -mz, mx1, my1, mz),
    B('arm', r.handle[0], r.handle[2] - 20, -10, r.handle[1], r.handle[2], 10),
    CX('cover', y, 0, Math.round(r.motor[0] * 0.8), r.brake[2], r.motor[1]), CX('motor', y, 0, r.motor[0], r.motor[1], r.motor[2]),
    B('terminal', tx0, y + r.motor[0] - 10, -tz, tx1, ty1, tz),
    ...(r.fan ? [B('cover', r.fan[0], y + r.motor[0] - 10, -r.fan[3], r.fan[1], r.fan[2], r.fan[3])] : []),
    ...(r.eye ? [CY('eye', r.eye[0], 0, 14, y + r.motor[0] - 5, r.eye[1])] : []),
    CX('handwheel', y, 0, r.flywheel[0], r.flywheel[1], r.flywheel[2]),
  ];
}

/** The outboard support of the S versions: a foot across [z0, z1] ±x, its holes on its middle, the bearing at the axis. */
interface Support { x: number; z: readonly [number, number]; holes: number; top: number }

function machine(model: string, r: Range, sheaves: (readonly [number, number, number])[], src: string, s?: Support): MachineShape {
  // the slow shaft ends in the hub of the widest sheave, at its outer face; the S versions' runs on to their support
  const end = Math.max(...sheaves.map(([, P, E]) => P + E / 2)), zc = s ? (s.z[0] + s.z[1]) / 2 : 0, rb = s ? s.top - r.yWheel : 0;
  const support: ShapePart[] = s ? [
    B('pedestal', -s.x, 0, s.z[0], s.x, r.base, s.z[1]), B('pedestal', -rb, r.base, s.z[0], rb, r.yWheel, s.z[1]),
    CZ('cover', 0, r.yWheel, rb, s.z[0], s.z[1]), CZ('shaft', 0, r.yWheel, Math.round(r.covers[0] * 0.38), end, s.z[0]),
  ] : [];
  return {
    brand: 'Montanari', model, yWheel: r.yWheel, yWorm: r.yWorm, sheaves,
    feet: s ? [r.feet[0], r.feet[1], r.feet[2], s.z[1]] : r.feet, holes: s ? [...r.holes, [-s.holes, zc], [s.holes, zc]] : r.holes, hole: r.hole,
    parts: [...body(r, end), ...support], overall: r.overall, src, wormScaled: true, paint: 'blue',
  };
}

/** The sheet's sheave diameters, all at the mid-plane P and width E. */
const sheaves = (P: number, E: number, Ds: readonly number[]): (readonly [number, number, number])[] => Ds.map((D) => [D, P, E] as const);

const DOC = 'documento fornito dal cliente il 3 ottobre 2026';
const M65: Range = {
  yWheel: 150, yWorm: 260, feet: [-150, -131, 151, 131], holes: grid([-120, 120], [-110, 110]), hole: 'Ø21,5', base: 51, overall: [150, 684.5, 545],
  box: [128, 355, 105], covers: [100, 30], brake: [100, 128, 231], levers: [150, 205, 120, 440, 100, 118], magnet: [140, 215, 430, 490, 55],
  handle: [140, 310, 545], motor: [125, 231, 630], terminal: [324, 530, 474, 70], flywheel: [192.5, 630, 684.5],
};
const M73: Range = {
  yWheel: 150, yWorm: 279, feet: [-150, -140, 335, 140], holes: grid([-120, 120, 305], [-110, 110]), hole: 'Ø19,5', base: 30, overall: [150.5, 733, 546],
  box: [130, 366, 107], covers: [110, 18], brake: [95, 140, 290], levers: [185, 240, 140, 470, 97, 115], magnet: [170, 255, 460, 510, 60],
  handle: [160, 330, 546], motor: [135, 300, 685], terminal: [371, 596, 491, 65], flywheel: [192.5, 685, 733], eye: [326, 455],
};
const M93: Range = {
  yWheel: 200, yWorm: 362, feet: [-204, -175, 440, 175], holes: grid([-170, 170, 405], [-150, 150]), hole: 'Ø24,5', base: 33, overall: [171, 895, 631],
  box: [185, 465, 150], covers: [150, 20], brake: [115, 195, 340], levers: [245, 300, 180, 590, 115, 135], magnet: [230, 315, 580, 615, 70],
  handle: [210, 420, 631], motor: [175, 360, 850], terminal: [480, 750, 614, 80], flywheel: [192.5, 850, 895],
};
const M98: Range = {
  yWheel: 230, yWorm: 434, feet: [-230, -175, 494, 175], holes: grid([-190, 190, 455], [-150, 150]), hole: 'Ø25', base: 30, overall: [282, 1200, 924],
  box: [242, 604, 205], covers: [200, 0], brake: [150, 250, 420], levers: [300, 370, 230, 740, 150, 175], magnet: [280, 390, 700, 750, 80],
  handle: [200, 410, 775], motor: [200, 440, 1100], terminal: [570, 750, 700, 70], flywheel: [220, 1100, 1200], fan: [912, 1083, 924, 90],
};
const M98H: Range = { ...M98, feet: [-225, -200, 490, 200], holes: grid([-190, 190, 455], [-170, 170]), base: 34, overall: [283, 1160, 924], flywheel: [220, 1060, 1160], motor: [200, 440, 1060], fan: [880, 1050, 924, 90] };

const D93 = [450, 480, 520, 560, 600, 650, 700, 750, 800];
// the sheet's table DP / B (the sheave's width) / A (its mid-plane past the row of holes at 110): up to Ø600, 650, 700
const S73 = rows(215, '360/115 400/115 450/115 480/115 520/115 550/115 600/115 650/78/230 700/87/230');
const src73 = (m: string, pages: string): string => `disegno quotato della scheda Montanari Gearbox ${m} (pp. ${pages}; ${DOC})`;
const S73S: Support = { x: 110, z: [287.5, 332.5], holes: 85, top: 210 };

export const MONTANARI_SHAPES: readonly MachineShape[] = [
  machine('M65', M65, sheaves(190, 78, [360, 400, 450, 480, 520, 550, 600]), `disegno quotato della scheda Montanari Gearbox M65 (p. 26; ${DOC})`),
  ...['M73', 'M73H'].map((m) => machine(m, M73, S73, src73('M73', '36-37'))),
  machine('M73S', M73, S73, src73('M73', '36-37'), S73S),
  ...['M75', 'M75H'].map((m) => machine(m, M73, S73, src73('M75', '42-43'))),
  machine('M75S', M73, S73, src73('M75', '42-43'), S73S),
  // the drawn sheave: its outer face at the sheet's 337,5 from the worm's plane, its mid-plane at 150 + 115 (E 160 max)
  machine('M93', M93, sheaves(265, 145, D93), `disegno quotato della scheda Montanari M93-M95 Rev 21_05_24 (p. 72; ${DOC})`),
  machine('M95', M93, sheaves(280, 180, D93), `disegno quotato della scheda Montanari M93-M95 Rev 21_05_24 (p. 73; ${DOC})`, { x: 170, z: [378.5, 448.5], holes: 140, top: 270 }),
  machine('M98', M98, sheaves(300, 180, D93), `disegno quotato della scheda Montanari M98 Rev 21_05_24 (p. 80; ${DOC})`, { x: 170, z: [415, 505], holes: 140, top: 310 }),
  machine('M98H', M98H, sheaves(301, 180, D93), `disegno quotato della scheda Montanari M98 Rev 21_05_24 (p. 81; ${DOC})`),
];
