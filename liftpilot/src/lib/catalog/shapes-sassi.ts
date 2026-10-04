// The geared machines of Sassi as they are (src/shaft/machine-shape.ts), from the dimensioned drawings of its catalogue
// REV 2023/01 the client supplied on 3 October 2026: the sheave's axis over the feet, the worm's, the overall sizes, the
// feet and their holes, the sheave's mid-plane P and width E (its widest), the flywheel's diameter. The drawings are in
// European projection, the front view seen from the side away from the sheave: our shapes have the motor at +X seen
// from the sheave, so MODY, LEO and TORO are their left-hand versions ("orizzontale sinistro", the hand our frame draws;
// the right-hand ones mount the casing on another face, with the sheave's axis elsewhere). Where the gearbox, the
// motor, the brake and the flywheel stand is read on the drawing in scale (±10 mm), and so is the worm of LEO and
// TORO, inclined by 15°. Only dimensions: the parts are our own boxes and cylinders. Pure.
import type { MachineShape, ShapePart, ShapeRole, Tilt } from '@/shaft/machine-shape';
import { B, CX, CZ, grid, rows } from './shape-kit';

const DOC = 'documento fornito dal cliente il 3 ottobre 2026';
export const sassiSrc = (page: number, what: string): string => `disegno quotato del catalogo argani Sassi REV 2023/01, p. ${page}, ${what} (${DOC})`;

/** The sheet's sheave diameters, all at the mid-plane P and width E. */
export const sassiSheaves = (P: number, E: number, Ds: string): (readonly [number, number, number])[] => rows(P, Ds.split(' ').map((d) => `${d}/${E}`).join(' '));
export const D320_600 = '320 360 400 450 480 520 560 600';
export const D450_700 = '450 480 520 560 600 650 700';
export const D450_800 = `${D450_700} 750 800`;
const D320_700 = `${D320_600} 650 700`;

/** The parts on the worm's axis at height y from x0 along +X, in order [role, radius, length]; turned with the worm. */
export function along(y: number, x0: number, list: readonly (readonly [ShapeRole, number, number])[], tilt?: Tilt): ShapePart[] {
  let x = x0;
  return list.map(([role, r, len]) => {
    const p = CX(role, y, 0, r, x, x + len);
    x += len;
    return tilt ? { ...p, tilt } : p;
  });
}

const inclined = (deg: number, at: readonly [number, number]): Tilt => ({ a: (deg * Math.PI) / 180, at });
const on = (t: Tilt, p: ShapePart): ShapePart => ({ ...p, tilt: t });

// LEO and TORO, left-hand: the worm over the wheel, falling 15° toward the motor from where it leaves the casing
const LEO_W = inclined(-15, [160, 228]), TORO_W = inclined(-15, [218, 302]);

export const SASSI_SHAPES: readonly MachineShape[] = [
  {
    brand: 'Sassi', model: 'MODY', yWheel: 150, yWorm: 260, sheaves: sassiSheaves(180, 80, D320_600),
    feet: [-122.5, -115, 122.5, 115], holes: grid([-102.5, 102.5], [-75, 75]), hole: 'M16',
    parts: [
      B('housing', -160, 0, -115, 134, 320, 115),
      CZ('cover', 0, 150, 120, -130, -115), CZ('cover', 0, 150, 120, 115, 130), CZ('shaft', 0, 150, 45, 130, 220),
      ...along(260, 134, [['cover', 100, 26], ['motor', 134, 164], ['brake', 170, 101], ['shaft', 30, 38], ['handwheel', 200, 37]]),
      B('terminal', 157, 401, -60, 333, 490, 60), B('magnet', 345, 445, -45, 430, 535, 45), B('arm', 299, 500, -10, 324, 651, 10),
    ],
    overall: [160, 500, 651], src: sassiSrc(13, 'versione orizzontale sinistra'), paint: 'grey-blue',
  },
  {
    brand: 'Sassi', model: 'LEO', yWheel: 135, yWorm: 228, sheaves: sassiSheaves(185, 90, D320_700),
    feet: [-130, -110, 130, 110], holes: grid([-102.5, 102.5], [-75, 75]), hole: 'M16',
    parts: [
      // the casing and, at its far end, the flange of the vertical mounting
      B('housing', -160, 0, -130, 160, 355, 120), B('housing', -230, 0, -80, -160, 300, 80),
      CZ('cover', 0, 135, 110, -145, -130), CZ('cover', 0, 135, 110, 120, 135), CZ('shaft', 0, 135, 40, 135, 230),
      ...along(228, 160, [['cover', 100, 54], ['motor', 129, 247], ['brake', 105, 125], ['shaft', 30, 61], ['handwheel', 175, 50]], LEO_W),
      on(LEO_W, B('terminal', 237, 360, -70, 400, 425, 70)), on(LEO_W, B('magnet', 586, 333, -45, 655, 485, 45)),
      B('arm', 620, 330, -10, 760, 352, 10),
    ],
    overall: [230, 760, 405], src: sassiSrc(20, 'versione orizzontale sinistra; vite inclinata di 15°'), wormScaled: true, paint: 'grey-blue',
  },
  {
    brand: 'Sassi', model: 'TORO', yWheel: 195, yWorm: 302, sheaves: sassiSheaves(225, 115, D320_700),
    feet: [-155, -145, 155, 145], holes: grid([-120, 120], [-120, 120]), hole: 'M24',
    parts: [
      B('base', -155, 0, -145, 155, 40, 145), B('housing', -195, 40, -145, 218, 485, 160),
      CZ('cover', 0, 195, 140, -160, -145), CZ('cover', 0, 195, 140, 160, 167), CZ('shaft', 0, 195, 50, 167, 282.5),
      ...along(302, 218, [['cover', 120, 44], ['motor', 135, 241], ['brake', 182, 57], ['shaft', 35, 65], ['handwheel', 200, 38]], TORO_W),
      on(TORO_W, B('terminal', 267, 452, -80, 405, 520, 80)), on(TORO_W, B('magnet', 513, 437, -45, 555, 613, 45)),
      B('arm', 535, 480, -10, 560, 650, 10),
    ],
    overall: [195, 700, 650], src: sassiSrc(27, 'con freno a tamburo, versione orizzontale sinistra, quote del motore 270; vite inclinata di 15°'),
    wormScaled: true, paint: 'grey-blue',
  },
  {
    brand: 'Sassi', model: 'MF48', yWheel: 170, yWorm: 310, sheaves: sassiSheaves(220, 115, D450_700),
    // four holes on the sheave's side, two on the other
    feet: [-190, -140, 190, 140], holes: [[-165, 115], [-80, 115], [80, 115], [165, 115], [-165, -115], [165, -115]], hole: 'Ø25',
    parts: [
      B('base', -190, 0, -140, 190, 25, 140), B('housing', -205, 25, -130, 179, 410, 150),
      CZ('cover', 0, 170, 140, -145, -130), CZ('cover', 0, 170, 140, 150, 160), CZ('shaft', 0, 170, 45, 160, 277.5),
      ...along(310, 179, [['motor', 133, 231], ['brake', 140, 145], ['shaft', 30, 5], ['handwheel', 205, 40]]),
      B('terminal', 197, 446, -70, 356, 525, 70), B('magnet', 471, 534, -45, 542, 640, 45), B('arm', 405, 560, -10, 430, 700, 10),
      B('arm', 455, 200, 140, 510, 480, 158), B('arm', 455, 200, -158, 510, 480, -140),
    ],
    overall: [205, 600, 700], src: sassiSrc(39, 'con freno DF03'), paint: 'grey-blue',
  },
];
