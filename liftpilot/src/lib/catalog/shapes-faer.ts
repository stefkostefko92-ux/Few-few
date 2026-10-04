// The geared machines of FAER as they are (src/shaft/machine-shape.ts), from the dimensioned drawings of the maker's
// model sheets (faer.net, read on 2 October 2026; research ch. 17 § 6.2): the worm's axis over the feet (the P58S's cast
// ones, the angle feet of the P58F and P60F, the two beams 120 high of the P68F, P70F and P80F) and the slow shaft's over
// it, the feet's holes, the sheave's mid-plane P, the length from the slow shaft to the gearbox's far end and to the
// handwheel at the motor's end (the largest motor). The worm is under the wheel; the drum brake between the gearbox and
// the motor, its magnet over the motor's flange; the terminal box on the motor's back. The F versions carry the sheave
// between the gearbox and an outboard support on the same feet. The sheave's width, the height and where the parts stand
// are read on the drawings in scale (±10 mm); where a drawn motor is longer than the sheet's "max", the motor's side is
// fitted into the dimension. The castings' colour is not known (the sheets are in grey): black. Only dimensions: the
// parts are our own boxes and cylinders. Pure.
import type { MachineShape, ShapePart } from '@/shaft/machine-shape';
import { B, CX, CZ, grid, pair, rows } from './shape-kit';

const SRC = 'scheda del modello FAER (faer.net, 2 ottobre 2026)';

/** A box from two corners in any order. */
const box = (role: ShapePart['role'], ax: number, ay: number, az: number, bx: number, by: number, bz: number): ShapePart =>
  B(role, Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz), Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz));

/** One P gearbox: the worm's case on its feet, the wheel's round case over it, the brake, the motor, the handwheel. */
interface P {
  yWorm: number; yWheel: number; holes: [number, number][]; hole: string;
  /** the feet: cast with the gearbox, two angles 7 thick or two beams 120 × 120 along Z under the holes' lines, as high
   *  as `lift` (the machine's own base over their underside) */
  feet: 'cast' | 'angle' | 'beam'; lift: number;
  /** the base plate along X, the gearbox along X, its half-width, the wheel's round case's radius */
  base: [number, number]; box: [number, number]; half: number; rc: number;
  /** the brake: drum [radius, x0, x1], its arms [x0, x1, top, z in, z out], the magnet [x0, x1, top, half-width], the
   *  hand release's top */
  drum: [number, number, number]; arms: [number, number, number, number, number]; magnet: [number, number, number, number];
  release: number;
  /** the motor: radius, x0, x1; the handwheel: radius, x0, x1 (its outer face the sheet's length) */
  motor: [number, number, number]; wheel: [number, number, number];
  overall: [number, number, number];
  /** the outboard support of the F versions: across [z0, z1] */
  support?: [number, number];
}

/** The feet under the holes' lines (x = ±xh) from z0 to z1: an angle's flange outward and its leg, or a beam. */
function feet(p: P, xh: number, z0: number, z1: number): ShapePart[] {
  const L = p.lift;
  if (p.feet === 'cast') return [B('base', p.base[0], 0, z0 + 5, p.base[1], 30, z1 - 5)];
  return [-1, 1].flatMap((s) => (p.feet === 'angle'
    ? [box('base', s * (xh - 40), 0, z0, s * (xh + 25), 7, z1), box('pedestal', s * (xh - 40), 7, z0, s * (xh - 33), L, z1)]
    : [box('base', s * (xh - 95), 0, z0, s * (xh + 25), 11, z1), box('pedestal', s * (xh - 38.25), 11, z0, s * (xh - 31.75), L - 11, z1),
      box('base', s * (xh - 95), L - 11, z0, s * (xh + 25), L, z1)]));
}

function machine(model: string, p: P, sheaves: (readonly [number, number, number])[]): MachineShape {
  const L = p.lift, y = p.yWorm, [bx0, bx1] = p.box, h = p.half, [dr, dx0, dx1] = p.drum, [ax0, ax1, atop, zi, zo] = p.arms, [gx0, gx1, gtop, gz] = p.magnet;
  const [mr, mx0, mx1] = p.motor, [hr, hx0, hx1] = p.wheel, P0 = Math.max(...sheaves.map((s) => s[1] + s[2] / 2));
  const zs = p.holes.map((q) => q[1]), z0 = Math.min(...zs) - 25, z1 = Math.max(...zs) + 25, xh = Math.max(...p.holes.map((q) => Math.abs(q[0])));
  const b0 = p.feet === 'cast' ? 30 : L + 25;
  const parts: ShapePart[] = [
    ...feet(p, xh, z0, z1),
    ...(p.feet === 'cast' ? [] : [B('base', p.base[0], L, -h - 30, p.base[1], b0, h + 30)]),
    B('housing', bx0, b0, -h, bx1, y + 0.5 * (p.yWheel - y), h), CZ('housing', 0, p.yWheel, p.rc, -h, h),
    CZ('cover', 0, p.yWheel, Math.round(0.42 * p.rc), -h - 16, -h), CZ('cover', 0, p.yWheel, Math.round(0.55 * p.rc), h, h + 16),
    CZ('shaft', 0, p.yWheel, Math.round(0.26 * p.rc), h + 16, p.support ? p.support[0] : P0),
    CX('brake', y, 0, dr, dx0, dx1), ...pair('arm', ax0, b0, zi, ax1, atop, zo), B('magnet', gx0, y + mr - 25, -gz, gx1, gtop, gz),
    B('arm', (ax0 + ax1) / 2 - 8, atop - 10, -8, (ax0 + ax1) / 2 + 8, p.release, 8),
    CX('cover', y, 0, Math.round(0.8 * mr), dx1, mx0), CX('motor', y, 0, mr, mx0, mx1), CX('shaft', y, 0, 22, mx1, hx0),
    // the terminal box on the motor's back (toward −Z), its glands down
    B('terminal', Math.round(mx0 + 0.15 * (mx1 - mx0)), Math.round(y - 0.55 * mr), -mr - 50, Math.round(mx0 + 0.75 * (mx1 - mx0)), Math.round(y + 0.5 * mr), -mr + 12),
    CX('handwheel', y, 0, hr, hx0, hx1),
  ];
  if (p.support) {
    // the support on the feet past the sheave: its plate across them, the pedestal up to the bearing on the slow shaft
    const [s0, s1] = p.support, sx = Math.round(0.55 * p.rc);
    parts.push(B('base', -xh - 25, L, s0, xh + 25, b0, s1),
      { role: 'pedestal', prism: [[-sx, b0], [sx, b0], [0.45 * sx, p.yWheel + 0.35 * p.rc], [-0.45 * sx, p.yWheel + 0.35 * p.rc]], span: [s0, s1] },
      CZ('cover', 0, p.yWheel, Math.round(0.4 * p.rc), s0 - 14, s0));
  }
  return {
    brand: 'FAER', model, yWheel: p.yWheel, yWorm: y, sheaves, feet: [Math.min(p.base[0], -xh - 25), z0, Math.max(p.base[1], xh + 25), z1], holes: p.holes,
    hole: p.hole, parts, overall: p.overall, src: SRC, heightScaled: true, sheaveScaled: true,
  };
}

// P58S: the worm 194 over the cast feet, the slow shaft 154 over it; 210 + 210 along the worm, max 410 past the gearbox
// to the handwheel; 4 × Ø17 on 360 × 270; P 215
const P58S: P = {
  yWorm: 194, yWheel: 348, holes: grid([-180, 180], [-135, 135]), hole: 'Ø17', feet: 'cast', lift: 0, base: [-210, 210], box: [-145, 160], half: 105, rc: 152,
  drum: [100, 170, 250], arms: [185, 235, 413, 80, 110], magnet: [246, 391, 471, 60], release: 520,
  motor: [156, 275, 545], wheel: [175, 580, 620], overall: [210, 620, 520],
};
// P58F, P60F: the same gearbox on two angles 7 thick, the worm 315 over their underside; 4 + 2 × Ø17, the support's row
// 110 past P = 225; to the handwheel max 405 (P58F) and 515 (P60F) past the gearbox
const P58F: P = {
  ...P58S, yWorm: 315, yWheel: 469, feet: 'angle', lift: 121, holes: grid([-180, 180], [-135, 135, 335]), motor: [156, 275, 540], wheel: [175, 575, 615],
  arms: [185, 235, 534, 80, 110], magnet: [246, 391, 592, 60], release: 641, overall: [210, 615, 641], support: [300, 362],
};
const P60F: P = { ...P58F, motor: [156, 275, 650], wheel: [175, 685, 725], overall: [210, 725, 641] };
// P68F: on two beams 120 high (flanges 120 wide, 470 over them), the worm 280 over their underside, the slow shaft 178
// over it; 4 + 2 × Ø20 on 420 across the rows at −160, +95 and +380, P 250; max 585 past the beams to the handwheel
const P68F: P = {
  yWorm: 280, yWheel: 458, holes: grid([-210, 210], [-160, 95, 380]), hole: 'Ø20', feet: 'beam', lift: 120, base: [-190, 181], box: [-190, 181], half: 150, rc: 190,
  drum: [110, 195, 285], arms: [210, 278, 520, 85, 118], magnet: [307, 444, 613, 60], release: 710,
  motor: [175, 288, 716], wheel: [209, 776, 820], overall: [235, 820, 710], support: [330, 410],
};
// P70F: as the P68F, the slow shaft 217 over the worm; max 660 past the beams
const P70F: P = { ...P68F, yWheel: 497, rc: 200, motor: [175, 288, 790], wheel: [209, 851, 895], overall: [235, 895, 730], release: 730 };
// P80F: as the P70F; 4 + 2 × Ø20 on 420 across the rows at −155, +100 and +425, P 275; max 590 past the beams
const P80F: P = {
  ...P70F, holes: grid([-210, 210], [-155, 100, 425]), motor: [175, 288, 720], wheel: [209, 781, 825], overall: [235, 825, 730], support: [375, 455],
};

export const FAER_SHAPES: readonly MachineShape[] = [
  machine('P58S', P58S, rows(215, '440/85 480/85 520/85 550/85 600/85')),
  machine('P58F', P58F, rows(225, '440/85 480/85 520/85 550/85 600/85')),
  machine('P60F', P60F, rows(225, '440/85 480/85 520/85 550/85 600/85')),
  machine('P68F', P68F, rows(250, '520/110 550/110 600/110 650/110')),
  machine('P70F', P70F, rows(250, '520/115 600/115 650/115 700/115')),
  machine('P80F', P80F, rows(275, '550/165')),
];
