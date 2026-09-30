// Vertical data of the installation: the floors with their rise, which entrance serves each floor, pit and headroom,
// the heights of car, car frame and counterweight, the buffers and the spaces for the maintenance person. Inputs and
// typical values only; the section and its checks are in section.ts.

export interface Floor {
  /** as written on the landing, e.g. "-1", "0", "5" */
  label: string;
  /** from this floor to the next one up [mm]; ignored on the top floor */
  rise: number;
  /** entrance served: A (front), B (the second one) or both */
  door: 'A' | 'B' | 'AB';
}

export interface VerticalInputs {
  /** rated speed [m/s]: buffer strokes and the jump of the car in the headroom depend on it */
  v: number;
  /** from the lowest floor up */
  floors: Floor[];
  /** index of the main floor (piano principale) */
  main: number;
  /** pit depth below the lowest floor and headroom above the top floor [mm] */
  pit: number;
  headroom: number;
  /** car: clear inside height, outside height, platform thickness [mm] */
  carH: number;
  carOutH: number;
  platform: number;
  /** car door operator: its highest point above the car floor [mm] */
  opTop: number;
  /** car frame: top of the crosshead and lowest point (buffer plate) from the car floor [mm] */
  frameTop: number;
  frameBelow: number;
  /** balustrade on the car roof [mm]; 0 = none */
  parapet: number;
  /** car buffers: number, height, stroke, and what they stand on (supports and plinths) [mm] */
  carBuffers: number;
  carBufferH: number;
  carBufferStroke: number;
  carBufferBase: number;
  /** counterweight: overall height [mm] */
  cwH: number;
  /** counterweight buffer: height, stroke, base [mm] */
  cwBufferH: number;
  cwBufferStroke: number;
  cwBufferBase: number;
  /** from the counterweight buffer plate to its buffer with the car at the top floor [mm] */
  cwRunby: number;
  /** spaces for the maintenance person: on the car roof and in the pit */
  topRefuge: 1 | 2;
  pitRefuge: 1 | 2 | 3;
}

export const DEFAULT_FLOORS: Floor[] = [
  { label: '0', rise: 3000, door: 'A' },
  { label: '1', rise: 3000, door: 'A' },
  { label: '2', rise: 3000, door: 'A' },
  { label: '3', rise: 3000, door: 'A' },
  { label: '4', rise: 0, door: 'A' },
];

export const DEFAULT_VERTICAL: VerticalInputs = {
  v: 0.63,
  floors: DEFAULT_FLOORS,
  main: 0,
  pit: 1400,
  headroom: 3700,
  carH: 2150,
  carOutH: 2200,
  platform: 100,
  opTop: 2500,
  frameTop: 2650,
  frameBelow: 330,
  parapet: 700,
  carBuffers: 2,
  carBufferH: 330,
  carBufferStroke: 135,
  carBufferBase: 600,
  cwH: 2500,
  cwBufferH: 330,
  cwBufferStroke: 135,
  cwBufferBase: 300,
  cwRunby: 250,
  topRefuge: 2,
  pitRefuge: 3,
};

/** Level of each floor above the lowest one [mm]. */
export function levels(floors: readonly Floor[]): number[] {
  const out: number[] = [];
  let z = 0;
  floors.forEach((f, i) => {
    out.push(z);
    if (i + 1 < floors.length) z += f.rise;
  });
  return out;
}

/** Travel: from the lowest to the top floor [mm]. */
export const travel = (floors: readonly Floor[]): number => levels(floors)[floors.length - 1] ?? 0;
