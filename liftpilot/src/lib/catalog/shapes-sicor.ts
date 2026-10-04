// The geared machines of SICOR as they are (src/shaft/machine-shape.ts): for each model with a CAD model on the maker's
// site, the sheet's dimensions — the sheave's and the worm's axes over the feet, the feet and their holes, the sheave's
// mid-plane P and width E by diameter (the conventional single wrap), the overall sizes — and where the gearbox, the
// motor, the brake and the handwheel stand, read off the maker's CAD model and rounded to the millimetre. Only
// dimensions: the parts are our own boxes and cylinders, nothing of the maker's geometry is kept. Read on 2 October 2026
// from the technical sheets (Scheda tecnica … Geared 2025) and the CAD downloads of sicoritaly.com; the SV110 has no
// CAD model and keeps the generic machine. Pure.
import type { MachineShape, ShapePart } from '@/shaft/machine-shape';
import { B, CX, CY, CZ, arch, grid, pair, rows } from './shape-kit';

const SRC = 'scheda tecnica SICOR 2025 e modello CAD (sicoritaly.com, 2 ottobre 2026)';

/** The compact machines (SH): the gearbox on its feet with the worm above the wheel, the motor flanged on it, the
 *  brake and the handwheel at the motor's end, the sheave overhung beside the gearbox and below the feet. */
interface Compact {
  model: string; yWheel: number; yWorm: number; sheaves: (readonly [number, number, number])[]; feet: [number, number, number, number];
  holes: [number, number][]; hole: string; overall: [number, number, number];
  box: [number, number, number, number]; worm: [number, number, number, number, number]; motor: [number, number, number];
  foot: [number, number, number, number, number]; terminal: [number, number, number, number, number]; brake: [number, number, number];
  arms: [number, number, number, number, number, number]; magnet: ShapePart; wheel: [number, number, number]; shaft: [number, number];
  /** the worm's rear bearing cap past the gearbox: its radius and its end */
  rear?: [number, number];
}
function compact(c: Compact): MachineShape {
  const y = c.yWorm, [bx0, bx1, bh, bz] = c.box, [wx0, wx1, wy0, wy1, wz] = c.worm, [fx0, fx1, fy0, fy1, fz] = c.foot, [tx0, tx1, ty0, ty1, tz] = c.terminal;
  const parts: ShapePart[] = [
    B('housing', bx0, 0, -bz, bx1, bh, bz), B('housing', wx0, wy0, -wz, wx1, wy1, wz),
    CZ('cover', 0, c.yWheel, c.shaft[0] * 2.1, bz, bz + 18), CZ('shaft', 0, c.yWheel, c.shaft[0], bz + 18, c.shaft[1]),
    CX('motor', y, 0, c.motor[0], c.motor[1], c.motor[2]), B('housing', fx0, fy0, -fz, fx1, fy1, fz), B('terminal', tx0, ty0, -tz, tx1, ty1, tz),
    CX('brake', y, 0, c.brake[0], c.brake[1], c.brake[2]), ...pair('arm', ...c.arms), c.magnet, CX('handwheel', y, 0, c.wheel[0], c.wheel[1], c.wheel[2]),
    ...(c.rear ? [CX('cover', y, 0, c.rear[0], c.rear[1], bx0)] : []),
  ];
  return { brand: 'SICOR', model: c.model, yWheel: c.yWheel, yWorm: c.yWorm, sheaves: c.sheaves, feet: c.feet, holes: c.holes, hole: c.hole, parts, overall: c.overall, src: SRC };
}

export const SICOR_SHAPES: readonly MachineShape[] = [
  compact({
    model: 'SH110B', yWheel: 162, yWorm: 272, sheaves: rows(187, '320/76/190 360/70 400/70 450/70 480/70 520/70 550/70 600/70'), feet: [-162, -98, 155, 98],
    holes: grid([-102, 103], [-75, 75]), hole: 'M20', overall: [162, 537, 549],
    box: [-162, 155, 328, 98], worm: [40, 155, 200, 464, 112], motor: [140, 155, 357], foot: [187, 337, 93, 147, 86], terminal: [169, 279, 402, 477, 100],
    brake: [138, 357, 433], arms: [361, 123, 81, 418, 485, 170], magnet: B('magnet', 279, 422, -77, 443, 558, 77), wheel: [172, 433, 508], shaft: [30, 222],
  }),
  compact({
    model: 'SH130', yWheel: 166, yWorm: 300, sheaves: rows(192, '320/76/195 360/70 400/70 450/70 480/70 520/70 550/70 600/70 650/70 700/70'),
    feet: [-166, -112, 165, 112], holes: grid([-110, 110], [-90, 90]), hole: 'M20', overall: [166, 583, 577],
    box: [-166, 165, 345, 112], worm: [60, 165, 200, 501, 130], motor: [138, 165, 388], foot: [219, 369, 121, 175, 86], terminal: [181, 295, 430, 505, 102],
    brake: [138, 388, 456], arms: [393, 151, 81, 450, 513, 170], magnet: CZ('magnet', 422, 503, 54, -60, 60), wheel: [172, 456, 539], shaft: [30, 227],
  }),
  compact({
    model: 'SH130G', yWheel: 166, yWorm: 300, sheaves: rows(197, '480/90 520/90 550/90 600/70/192'), feet: [-166, -112, 165, 112],
    holes: grid([-110, 110], [-90, 90]), hole: 'M20', overall: [166, 583, 584],
    box: [-166, 160, 357, 123], worm: [70, 160, 200, 503, 137], motor: [143, 160, 435], foot: [259, 409, 111, 165, 86], terminal: [181, 295, 437, 512, 102],
    brake: [155, 435, 525], arms: [438, 152, 90, 492, 522, 186], magnet: CZ('magnet', 465, 510, 54, -60, 60), wheel: [189, 525, 583], shaft: [30, 242],
  }),
  compact({
    model: 'SH140', yWheel: 166, yWorm: 300, sheaves: rows(210, '360/100 400/100 450/100 480/100 520/100 560/100 600/100'), feet: [-165, -123, 155, 123],
    holes: grid([-109, 111], [-100, 100]), hole: 'M20', overall: [166, 583, 584],
    box: [-166, 160, 357, 123], worm: [70, 160, 200, 503, 137], motor: [143, 160, 435], foot: [259, 409, 111, 165, 86], terminal: [181, 295, 437, 512, 102],
    brake: [155, 435, 525], arms: [438, 152, 90, 492, 522, 186], magnet: CZ('magnet', 465, 510, 54, -60, 60), wheel: [189, 525, 583], shaft: [30, 260],
  }),
  compact({
    model: 'SH160', yWheel: 225, yWorm: 400, sheaves: rows(248.5, '450/115 520/115 560/115 600/115 650/115 700/115'), feet: [-225, -158, 239, 158],
    holes: grid([-117.5, 117.5], [-130, 130]), hole: 'M24', overall: [257, 768, 733],
    box: [-225, 239, 480, 158], worm: [120, 239, 220, 582, 164], motor: [176, 239, 517], foot: [313, 413, 160, 233, 60], terminal: [258, 443, 576, 652, 110],
    brake: [189, 517, 606], arms: [514, 204, 100, 572, 665, 229], magnet: CZ('magnet', 528, 652, 60, -78, 78), wheel: [239, 606, 656], shaft: [50, 306],
    rear: [44, -257],
  }),
  compact({
    model: 'SH190', yWheel: 209, yWorm: 399, sheaves: rows(271, '520/176/279 600/160 650/160 690/160 750/160'), feet: [-245, -181, 245, 181],
    holes: grid([-190, 190], [-115, 115]), hole: 'M24', overall: [289, 769, 732],
    box: [-252, 246, 503, 181], worm: [80, 246, 230, 623, 181], motor: [160, 246, 560], foot: [300, 500, 168, 240, 110], terminal: [262, 509, 559, 654, 110],
    brake: [200, 560, 680], arms: [590, 203, 120, 650, 731, 229], magnet: CZ('magnet', 620, 680, 50, -80, 80), wheel: [239, 680, 737], shaft: [55, 351],
    rear: [50, -289],
  }),
  {
    // the compact MR12C: the worm through the gearbox, the motor at one end, the brake and the handwheel at the other
    brand: 'SICOR', model: 'MR12C', yWheel: 172, yWorm: 306, sheaves: rows(197, '340/76/195 400/70 450/70 480/70 550/70 600/68/232'),
    feet: [-145, -115, 145, 115], holes: grid([-110, 110], [-90, 90]), hole: 'Ø22', overall: [348, 542, 555], src: SRC,
    parts: [
      B('base', -145, 0, -115, 145, 22, 115), B('housing', -165, 22, -140, 140, 405, 140), CZ('cover', 0, 172, 66, 140, 158), CZ('shaft', 0, 172, 32, 158, 232),
      CX('cover', 306, 0, 100, 140, 200), CX('motor', 306, 0, 142, 200, 542), B('terminal', 141, 448, -82, 341, 525, 82),
      CX('brake', 306, 0, 113, -300, -165), ...pair('arm', -223, 186, 55, -157, 493, 146), CZ('magnet', -190, 481, 54, -60, 60), B('arm', -221, 405, -44, -21, 440, 44),
      CX('handwheel', 306, 0, 170, -348, -300),
    ],
  },
  {
    // the large MR machines: the gearbox with the worm below the wheel on a cast base, the drum brake between it and the
    // flange of the motor, the motor's own bracket, the handwheel at the motor's end
    brand: 'SICOR', model: 'MR21', yWheel: 475, yWorm: 260, sheaves: rows(290, '520/176 600/160 650/160 690/160 750/160'),
    feet: [-230, -200, 520, 200], holes: grid([-190, -145, 145, 190], [-165, 165]), hole: 'Ø24', overall: [317, 1216, 727], src: SRC,
    parts: [
      B('base', -230, 0, -200, 520, 45, 200), arch(-240, 262, 45, 475, 235, -190, 190), CZ('cover', 0, 475, 126, -208, -190), B('cover', -125, 350, 190, 125, 665, 216),
      CZ('shaft', 0, 475, 53, 216, 370), B('housing', -90, 700, -75, 90, 727, 75),
      CX('cover', 260, 0, 89, -286, -240), CX('cover', 260, 0, 66, -308, -286), CX('cover', 260, 0, 117, 236, 276), CX('shaft', 260, 0, 55, 276, 355),
      CX('brake', 260, 0, 127, 355, 465), ...pair('arm', 359, 109, 97, 464, 571, 190), CZ('magnet', 410, 550, 60, -78, 78),
      B('pedestal', 482, 45, -67, 518, 640, 67), CY('eye', 500, 0, 24, 640, 690), CX('cover', 260, 0, 200, 525, 545),
      B('motor', 545, 103, -158, 1085, 418, 158), B('terminal', 860, 418, -130, 1000, 502, 100), CX('cover', 260, 0, 63, 1085, 1200), CX('handwheel', 260, 0, 214, 1200, 1250),
    ],
  },
  {
    brand: 'SICOR', model: 'MR26', yWheel: 540, yWorm: 280, sheaves: rows(330, '600/160 650/160 690/160 750/160 800/160'),
    feet: [-275, -210, 570, 210], holes: grid([-230, -180, 180, 230], [-175, 175]), hole: 'Ø24', overall: [387, 1410, 827], src: SRC,
    parts: [
      B('base', -275, 0, -210, 570, 45, 210), arch(-305, 305, 45, 540, 285, -200, 200), CZ('cover', 0, 540, 130, -222, -200), B('cover', -140, 400, 200, 140, 730, 230),
      CZ('shaft', 0, 540, 60, 230, 410), B('housing', -90, 800, -75, 90, 827, 75),
      CX('cover', 280, 0, 95, -375, -305), CX('shaft', 280, 0, 20, -387, -375), CX('cover', 280, 0, 136, 305, 336), CX('shaft', 280, 0, 65, 336, 405),
      CX('brake', 280, 0, 140, 405, 515), ...pair('arm', 409, 110, 109, 511, 620, 206), CZ('magnet', 460, 600, 60, -78, 78),
      B('pedestal', 532, 45, -67, 568, 670, 67), CY('eye', 550, 0, 25, 670, 720), CX('cover', 280, 0, 225, 575, 593),
      B('motor', 593, 110, -170, 1136, 450, 170), B('terminal', 880, 450, -100, 1060, 522, 130), CX('cover', 280, 0, 104, 1136, 1270), CX('handwheel', 280, 0, 215, 1270, 1300),
    ],
  },
  {
    // the MR35 carries its sheave between the gearbox and an outboard pedestal with the outer bearing
    brand: 'SICOR', model: 'MR35', yWheel: 685, yWorm: 350, sheaves: rows(275, '690/208 770/252 800/208 885/208'),
    feet: [-300, -262, 300, 599], holes: grid([-240, 240], [-190, 80, 470]), hole: 'Ø28', overall: [443, 1725, 1062], src: SRC,
    parts: [
      B('base', -300, 0, -262, 300, 106, 599), arch(-350, 350, 106, 685, 345, -258, 130), B('cover', -201, 485, 130, 201, 886, 145), B('housing', -90, 1028, -75, 90, 1062, 75),
      { role: 'pedestal', prism: [[-300, 106], [300, 106], [170, 640], [-170, 640]], span: [430, 599] }, B('cover', -150, 605, 430, 150, 775, 555),
      CZ('cover', 0, 685, 80, 555, 575), CZ('shaft', 0, 685, 70, 130, 560),
      B('cover', -435, 230, -120, -306, 470, 120), B('housing', 300, 106, -140, 470, 520, 140), CX('brake', 350, 0, 175, 442, 635),
      ...pair('arm', 485, 90, 40, 625, 733, 256), B('magnet', 442, 733, -198, 638, 848, 128),
      B('pedestal', 640, 106, -120, 700, 590, 120), CX('cover', 350, 0, 225, 640, 700),
      B('motor', 700, 185, -165, 1255, 515, 165), B('terminal', 1020, 515, -100, 1180, 592, 130), CX('cover', 350, 0, 150, 1255, 1330), CX('shaft', 350, 0, 59, 1330, 1375),
      CX('handwheel', 350, 0, 214, 1375, 1430),
    ],
  },
];
