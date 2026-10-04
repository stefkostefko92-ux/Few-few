// The geared machines of GEM (HW range) as they are (src/shaft/machine-shape.ts), from the dimensioned drawings of the
// maker's model sheets (catalogo GEM 2019 and REV2021, gem-ita.com, read on 2 October 2026; research ch. 17 § 5.2): the
// slow shaft's and the worm's axes over the feet, the overall sizes, the feet and their holes, the sheave's mid-plane P
// and width E (the Ø 600 its own), the slow shaft's end, the outboard support of the L and CL versions, the handwheel's
// diameter. All have the worm over the wheel; the motor overhangs one end of the worm, the drum brake and the handwheel
// the other (the VF: a disc at the motor's end instead of the handwheel; the HW175: motor, brake and handwheel in line on
// one side). Where the gearbox, the motor, the brake with its magnet and the terminal box stand is read on the drawings
// in scale (±10 mm). Only dimensions: the parts are our own boxes and cylinders. GEM paints its castings navy (the
// sheets' photos). Pure.
import type { MachineShape, ShapePart } from '@/shaft/machine-shape';
import { B, CX, CZ, grid, pair, rows } from './shape-kit';

const SRC = 'scheda del modello, catalogo GEM 2019 e REV2021 (gem-ita.com, 2 ottobre 2026)';

/** One HW gearbox: the wheel's case on the base, the worm's case over it, covers on the slow shaft. */
interface Hw {
  yWheel: number; yWorm: number; foot: [number, number, number, number]; base: number; holes: [number, number][]; hole: string;
  overall: [number, number, number];
  /** the slow shaft's end across (the hub's outer face) */
  end: number;
  /** the wheel's case [x0, x1, top, half-width], the worm's case over it [x0, x1, top, half-width] */
  wheel: [number, number, number, number]; worm: [number, number, number, number];
  /** the motor: radius, from x0 to x1, its flange [radius, x0]; the terminal box [x0, x1, top, half-width] */
  motor: [number, number, number]; flange: [number, number]; terminal: [number, number, number, number];
  /** the drum brake [radius, x0, x1], its arms [x0, y0, z in, x1, y1, z out], the magnet along Z [x, y, radius,
   *  half-length], the hand release lever [x0, x1, top: its pivot's on the magnet, the machine's height] */
  brake: [number, number, number]; arms: [number, number, number, number, number, number]; magnet: [number, number, number, number];
  lever: [number, number, number];
  /** the handwheel (or the VF's disc) [radius, x0, x1] */
  wheelHand: [number, number, number];
  /** what else the sheet draws: a forced-ventilation unit, the worm's end cap */
  extra?: ShapePart[];
}

/** The outboard support of the L and CL versions: its plate across [z0, z1], half-length along X, the holes' spacing
 *  along X and their row across, the bearing pedestal's top. */
interface Support { z: [number, number]; x: number; holes: number; row: number; top: number }

function hw(model: string, h: Hw, sheaves: (readonly [number, number, number])[], s?: Support, bodyFrom?: string): MachineShape {
  const y = h.yWorm, [fx0, fz0, fx1, fz1] = h.foot, [cx0, cx1, ctop, cz] = h.wheel, [wx0, wx1, wtop, wz] = h.worm;
  const [mr, mx0, mx1] = h.motor, [tx0, tx1, ttop, tz] = h.terminal, [br, bx0, bx1] = h.brake, [gx, gy, gr, gz] = h.magnet;
  const end = s ? s.z[0] : h.end, rs = Math.round(0.38 * cz), top = h.lever[2];
  const parts: ShapePart[] = [
    B('base', fx0, 0, fz0, fx1, h.base, fz1), B('housing', cx0, h.base, -cz, cx1, ctop, cz), B('housing', wx0, ctop, -wz, wx1, wtop, wz),
    CZ('cover', 0, h.yWheel, Math.round(0.72 * cz), cz, cz + 16), CZ('cover', 0, h.yWheel, Math.round(0.72 * cz), -cz - 16, -cz), CZ('shaft', 0, h.yWheel, rs, cz + 16, end),
    CX('cover', y, 0, h.flange[0], h.flange[1], mx0), CX('motor', y, 0, mr, mx0, mx1), B('terminal', tx0, y + mr - 10, -tz, tx1, ttop, tz),
    CX('brake', y, 0, br, bx0, bx1), ...pair('arm', ...h.arms), CZ('magnet', gx, gy, gr, -gz, gz),
    // the hand release's pivot block on the magnet (its lever is the brake's, components/machine/shape/brake.ts)
    B('arm', gx - 18, gy + gr - 8, -14, gx + 18, top, 14),
    CX('handwheel', y, 0, ...h.wheelHand), ...(h.extra ?? []),
  ];
  const support: ShapePart[] = s ? [
    B('pedestal', -s.x, 0, s.z[0], s.x, h.base, s.z[1]),
    { role: 'pedestal', prism: [[-s.x, h.base], [s.x, h.base], [0.6 * s.x, s.top], [-0.6 * s.x, s.top]], span: s.z },
    CZ('cover', 0, h.yWheel, Math.round(0.5 * s.x), s.z[0] - 14, s.z[0]),
  ] : [];
  return {
    brand: 'GEM', model, yWheel: h.yWheel, yWorm: y, sheaves, feet: s ? [fx0, fz0, fx1, s.z[1]] : h.foot,
    holes: s ? [...h.holes, [-s.holes / 2, s.row], [s.holes / 2, s.row]] : h.holes, hole: h.hole, parts: [...parts, ...support], overall: h.overall, src: SRC,
    paint: 'navy', ...(bodyFrom ? { bodyFrom } : {}),
  };
}

// HW134 CAMEL: slow shaft 153 over the feet, the worm 134 over it; feet 280 × 230 (25 thick), 4 × Ø21 on 224 × 184;
// 300/345 to the handwheel's faces on the brake's side, 500 to the motor's end, 552 high; the shaft's end 81 past P
const HW134: Hw = {
  yWheel: 153, yWorm: 287, foot: [-140, -115, 140, 115], base: 25, holes: grid([-112, 112], [-92, 92]), hole: 'Ø21', overall: [345, 500, 552], end: 272,
  wheel: [-125, 125, 230, 100], worm: [-135, 142, 420, 110], motor: [137, 172, 500], flange: [118, 142], terminal: [175, 340, 489, 60],
  brake: [105, -215, -145], arms: [-205, 165, 78, -155, 435, 108], magnet: [-182, 461, 63, 55], lever: [-200, -20, 552], wheelHand: [170, -345, -300],
  extra: [CX('cover', 287, 0, 75, -145, -135)],
};
// HW134VF (inverter only): 273 + 404 long, the brake's end cap on one side, the disc Ø 310 at the motor's end (427 wide:
// 155 to the far side, the disc's radius); the motor shorter
const HW134VF: Hw = {
  ...HW134, overall: [273, 404, 552], motor: [135, 150, 376], flange: [118, 128], terminal: [178, 342, 485, 60],
  brake: [100, -235, -145], arms: [-194, 165, 78, -153, 455, 108], magnet: [-209, 500, 50, 55], lever: [-199, -20, 552], wheelHand: [155, 376, 404],
  extra: [CX('cover', 287, 0, 75, -145, -135), CX('cover', 287, 0, 42, -273, -235)],
};
// HW135VF: the worm 135 over the slow shaft, 4 × Ø22; 300 to the handwheel, 460 (440) to the motor's end, 562 high;
// the sheave 70 or 80 wide (the wider taken)
const HW135VF: Hw = {
  ...HW134, yWorm: 288, hole: 'Ø22', overall: [300, 460, 562], worm: [-140, 117, 425, 110], motor: [116, 198, 460], flange: [135, 117],
  terminal: [117, 196, 450, 50], brake: [100, -212, -150], arms: [-200, 165, 78, -155, 440, 108], magnet: [-172, 495, 62, 55], lever: [-200, -48, 562],
  wheelHand: [170, -300, -288], extra: [CX('cover', 288, 0, 75, -150, -140)],
};
// HW140C LION: the worm 140 over the slow shaft, the base 27 thick; 452–522 to the motor's end (the forced-ventilation
// unit there), 308 + 15–63 to the handwheel, 590 high; P 215, E 100, the shaft's end at 286
const HW140C: Hw = {
  yWheel: 153, yWorm: 293, foot: [-140, -115, 140, 115], base: 27, holes: grid([-112, 112], [-92, 92]), hole: 'Ø21', overall: [371, 522, 590], end: 286,
  wheel: [-125, 125, 232, 100], worm: [-160, 144, 439, 115], motor: [127, 175, 414], flange: [125, 144], terminal: [163, 328, 496, 60],
  brake: [100, -250, -176], arms: [-238, 165, 80, -187, 455, 110], magnet: [-215, 499, 64, 55], lever: [-238, -60, 565], wheelHand: [170, -371, -323],
  extra: [CX('cover', 293, 0, 80, -176, -160), B('cover', 414, 170, -92, 522, 588, 92)],
};
// HW175 ELEPHANT: slow shaft 200 over the feet, the worm 173 over it; feet 477 × 310, 4 × Ø25 at 242 and 149 from the
// slow shaft (not symmetric) × 260; 550–667 to the handwheel Ø 440 past the motor and the brake, 206 on the other side,
// 750 high; P 265, E 135, 566 wide (225 to the far side, the handwheel's radius)
const HW175: Hw = {
  yWheel: 200, yWorm: 373, foot: [-192, -155, 285, 155], base: 60, holes: grid([-149, 242], [-130, 130]), hole: 'Ø25', overall: [206, 667, 750], end: 341,
  wheel: [-193, 250, 300, 150], worm: [-190, 188, 532, 130], motor: [161, 225, 500], flange: [150, 188], terminal: [249, 446, 577, 70],
  brake: [110, 510, 600], arms: [528, 164, 95, 603, 540, 125], magnet: [569, 627, 57, 60], lever: [433, 600, 692], wheelHand: [220, 630, 667],
  extra: [CX('cover', 373, 0, 80, -206, -190), B('cover', 113, 524, -80, 235, 750, 80)],
};

// the support of the L versions: a plate 192 × 65, 2 × Ø17 at 144, their row 224 past the feet's nearer one (43 from the
// plate's inner edge); of the CL: 230 × 74, 2 × Ø17 at 160, the row 123 past the sheave's mid-plane (22,5 from its outer
// edge); the pedestals' tops read in scale. The CL's sheet dimensions only P, the feet's holes and the support: its body
// is taken as the HW140C's
const L134: Support = { z: [273, 338], x: 96, holes: 144, row: 316, top: 245 };
const CL140: Support = { z: [286.5, 360.5], x: 115, holes: 160, row: 338, top: 265 };

const S134 = rows(191, '480/72 550/72'), S134_600 = rows(200, '600/68');

export const GEM_SHAPES: readonly MachineShape[] = [
  hw('HW134', HW134, S134), hw('HW134 Ø600', HW134, S134_600),
  hw('HW134L', HW134, S134, L134), hw('HW134L Ø600', HW134, S134_600, L134),
  hw('HW134VF', HW134VF, [...S134, ...S134_600]), hw('HW134VF con supporto', HW134VF, [...S134, ...S134_600], L134),
  hw('HW135VF', HW135VF, rows(191, '480/80 550/80')), hw('HW135L-VF', HW135VF, rows(191, '480/80 550/80'), L134),
  hw('HW140C', HW140C, rows(215, '480/100 560/100 600/100')), hw('HW140CL', HW140C, rows(215, '480/100 560/100 600/100'), CL140, 'HW140C'),
  hw('HW175', HW175, rows(265, '480/135 560/135 600/135')),
];
