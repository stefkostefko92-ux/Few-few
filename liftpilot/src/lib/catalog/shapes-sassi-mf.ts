// Sassi's larger machines as they are (shapes-sassi.ts says how they are read): MF84, the MF94 and its MB94 sister with
// the motor on its own bracket, the MB95. The MF94 is drawn with the motor on the left seen from the sheave: ours is its
// mirror image (the motor at +X, as the frame draws every machine), the holes and sizes unchanged. The MF94, the MB94
// and the MB95 carry the sheave between the gearbox and an outboard support with its own holes. The MB108 (on its
// pedestal) keeps the generic machine: its drawing does not say which of the pedestal's holes stand where. Pure.
import type { MachineShape, ShapePart } from '@/shaft/machine-shape';
import { B, CX, CZ, grid, pair } from './shape-kit';
import { D450_800, along, sassiSheaves, sassiSrc } from './shapes-sassi';

/** The gearbox of the MF94 and the MB94: its base plate, the casing, the worm's housing to its far end, the cover and
 *  the slow shaft running through the sheave to the outboard support (its foot, upright and bearing). */
const gear94 = (end: number): ShapePart[] => [
  B('base', -250, 0, -150, 470, 35, 150), B('housing', -190, 35, -192, 250, 644, 210), B('housing', end, 420, -90, -190, 620, 90),
  CZ('cover', 0, 260, 200, -207, -192), CZ('shaft', 0, 260, 70, 210, 430),
  B('pedestal', -170, 0, 430, 170, 45, 550), B('pedestal', -65, 45, 455, 65, 260, 525), CZ('cover', 0, 260, 80, 430, 550),
];
const holes94: [number, number][] = [...grid([-200, 235], [-120, 120]), [-140, 490], [140, 490]];

export const SASSI_MF_SHAPES: readonly MachineShape[] = [
  {
    brand: 'Sassi', model: 'MF84', yWheel: 200, yWorm: 390, sheaves: sassiSheaves(290, 180, D450_800),
    feet: [-250, -150, 250, 150], holes: grid([-200, 200], [-122.5, 122.5]), hole: 'M24',
    parts: [
      B('base', -250, 0, -150, 250, 55, 150), B('housing', -197, 55, -140, 209, 497, 190),
      CZ('cover', 0, 200, 190, -155, -140), CZ('shaft', 0, 200, 60, 190, 380),
      // the encoder on the worm's far end
      CX('cover', 390, 0, 35, -300, -197),
      ...along(390, 209, [['cover', 120, 8], ['motor', 150, 266], ['cover', 110, 23], ['brake', 180, 71], ['shaft', 35, 31], ['handwheel', 200, 52]]),
      B('terminal', 240, 575, -80, 459, 645, 80), B('magnet', 491, 614, -45, 608, 747, 45), B('arm', 460, 700, -10, 483, 820, 10),
      ...pair('arm', 515, 260, 180, 568, 600, 198),
    ],
    overall: [300, 660, 820], src: sassiSrc(45, 'motore 240/270, quote del motore 270, encoder compreso'), paint: 'grey-blue',
  },
  {
    brand: 'Sassi', model: 'MF94', yWheel: 260, yWorm: 508, sheaves: sassiSheaves(310, 180, D450_800),
    feet: [-250, -150, 470, 550], holes: holes94, hole: 'Ø25',
    parts: [
      ...gear94(-340), B('pedestal', 250, 35, -150, 470, 255, 150), CX('cover', 508, 0, 40, -440, -340),
      ...along(508, 250, [['cover', 120, 50], ['motor', 150, 220], ['brake', 160, 80], ['handwheel', 230, 105]]),
      B('terminal', 317, 695, -80, 458, 772, 80), B('magnet', 525, 755, -45, 650, 867, 45), B('arm', 495, 800, -10, 520, 950, 10),
      ...pair('arm', 530, 380, 160, 590, 700, 178),
    ],
    overall: [440, 705, 950], src: sassiSrc(52, 'MF94/240-270, quote del motore 270; disegnato speculare: motore a destra visto dalla puleggia'),
    paint: 'grey-blue',
  },
  {
    brand: 'Sassi', model: 'MB94', yWheel: 260, yWorm: 508, sheaves: sassiSheaves(310, 180, D450_800),
    feet: [-250, -150, 470, 550], holes: holes94, hole: 'Ø25',
    parts: [
      ...gear94(-350),
      ...along(508, 250, [['cover', 120, 30], ['brake', 200, 61], ['cover', 120, 196], ['shaft', 40, 23], ['motor', 250, 630]]),
      // the motor's bracket off the base, with its one foot (M20) near the motor's end
      B('pedestal', 470, 150, -250, 1190, 251, 250), B('pedestal', 1152, 0, -15, 1178, 150, 15),
      B('terminal', 760, 758, -100, 960, 830, 100), B('magnet', 250, 760, -50, 400, 880, 50), B('arm', 80, 800, -10, 105, 985, 10),
      ...pair('arm', 290, 350, 200, 331, 740, 218),
    ],
    overall: [350, 1190, 985], src: sassiSrc(54, 'motore su mensola con piede M20'), paint: 'grey-blue',
  },
  {
    brand: 'Sassi', model: 'MB95', yWheel: 315, yWorm: 574, sheaves: sassiSheaves(420, 180, D450_800),
    feet: [-278, -267, 278, 715], holes: [...grid([-225, -75, 75, 225], [-170, 170]), ...grid([-225, -75, 75, 225], [660])], hole: 'Ø25',
    parts: [
      B('base', -290, 0, -267, 280, 45, 214), B('housing', -310, 45, -250, 300, 760, 320), CX('cover', 574, 0, 90, -400, -310),
      CZ('cover', 0, 315, 250, -265, -250), CZ('shaft', 0, 315, 90, 320, 605),
      ...along(574, 300, [['cover', 120, 5], ['brake', 230, 100], ['cover', 130, 195], ['shaft', 40, 11], ['motor', 220, 639]]),
      B('pedestal', 305, 230, -260, 1235, 300, 260), B('pedestal', 1110, 0, -15, 1135, 230, 15),
      B('terminal', 640, 794, -90, 830, 868, 90), B('magnet', 270, 850, -60, 460, 1090, 60), B('arm', 100, 950, -10, 125, 1180, 10),
      ...pair('arm', 325, 400, 270, 385, 840, 290),
      B('pedestal', -278, 0, 605, 278, 45, 715), B('pedestal', -90, 45, 615, 90, 315, 705), CZ('cover', 0, 315, 110, 605, 715),
    ],
    overall: [400, 1250, 1180], src: sassiSrc(60, 'motore su mensola con piede M20'), paint: 'grey-blue',
  },
];
