// Data of the installation that neither the calculation nor the shaft design holds, for the data sheet of the drawing
// set: control, shaft, car finish, the safety gear, the lift's use and the governor's load on the slab, the electrical supply; and,
// optional, the machine's name when it is not the catalogue's, the bracket pitches and the parts of the car mass. What the
// design knows — doors, frame, rails new or existing (the acceptance test's parts), brackets, governor and its rope,
// buffers, the machine's mass, the cables, the dynamic coefficient — is never asked: the sheets take it from the design,
// so one value has one place. Every field is optional: an empty one prints as a dash. Validated with zod, stored on the
// project.
import { z } from 'zod';

const text = z.string().trim().max(80).optional();

/** The range of each number of the data [unit of the field]: the form's fields take the same. A bracket pitch is never
 *  zero (the brackets are counted by it). */
export const PLANT_RANGE = {
  carBracketPitch: [300, 10000], cwBracketPitch: [300, 10000], governorLoad: [0, 5000], currentIn: [0, 1000], currentStart: [0, 5000],
  voltage: [0, 1000], lightVoltage: [0, 1000], frequency: [0, 100], duty: [0, 100], massShell: [0, 10000], massFloor: [0, 10000], massDoors: [0, 10000],
  massFrame: [0, 10000],
} as const satisfies Readonly<Record<string, readonly [number, number]>>;
export type PlantNumber = keyof typeof PLANT_RANGE;
const num = (k: PlantNumber) => z.number().finite().min(PLANT_RANGE[k][0]).max(PLANT_RANGE[k][1]).optional();

export const plantSchema = z.object({
  /** the machine as named on the drawings when it is not the catalogue's, e.g. "MONTANARI M 73 (Sx)" */
  machine: text,
  control: text,
  shaft: text,
  carFinish: text,
  /** spacing of the rail brackets [mm] */
  carBracketPitch: num('carBracketPitch'),
  cwBracketPitch: num('cwBracketPitch'),
  /** load of the governor on the slab [daN] (P4) */
  governorLoad: num('governorLoad'),
  /** safety gear of the car: progressive, instantaneous roller type, instantaneous (impact factor of the rail loads) */
  safetyGear: z.enum(['progressive', 'roller', 'instantaneous']).optional(),
  /** use of the lift, for the force on the car's sill while loading (src/lib/tavole/forces.ts sillFactor): passengers,
   *  goods passenger, goods passenger with heavy handling devices outside the rated load */
  liftUse: z.enum(['passengers', 'goods', 'goodsHeavy']).optional(),
  /** rated and starting current [A] */
  currentIn: num('currentIn'),
  currentStart: num('currentStart'),
  /** supply: power and light voltage [V], frequency [Hz], duty [%] */
  voltage: num('voltage'),
  lightVoltage: num('lightVoltage'),
  frequency: num('frequency'),
  duty: num('duty'),
  /** parts of the car mass [kg]: shell, floor finish, operator and door panels, frame; together the car mass P */
  massShell: num('massShell'),
  massFloor: num('massFloor'),
  massDoors: num('massDoors'),
  massFrame: num('massFrame'),
  /** the counterweight's safety gear over a space people reach under the shaft (UNI EN 81-20:2020, 5.2.5.4): its type
   *  (the impact on its rails: the load P7), or in a modification an existing pillar to the ground in its place
   *  (UNI 10411-1:2024, 6.14); and what trips it — its own governor, the breakage of the suspension or a safety rope
   *  (prospetto 11) */
  cwSafetyGear: z.enum(['progressive', 'roller', 'instantaneous', 'pillar']).optional(),
  cwGearTrip: z.enum(['governor', 'rupture', 'rope']).optional(),
}).strict();

export type Plant = z.infer<typeof plantSchema>;

const KEYS: ReadonlySet<string> = new Set(Object.keys(plantSchema.shape));

/** The data as stored: a field an earlier form had (the ones the design now gives) is left out, a number it allowed
 *  outside today's range is dropped (printed as a dash), the rest is read as saved. */
export const plantReadSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const range: Readonly<Record<string, readonly [number, number]>> = PLANT_RANGE;
  const outside = ([k, v]: [string, unknown]): boolean => {
    const r = range[k];
    return r !== undefined && typeof v === 'number' && (!Number.isFinite(v) || v < r[0] || v > r[1]);
  };
  return Object.fromEntries(Object.entries(raw).filter((e) => KEYS.has(e[0]) && !outside(e)));
}, plantSchema);

/** The bracket pitches of the stored data of an installation (src/shaft/brackets.ts `withPitches`). */
export function pitchesOf(raw: unknown): { car?: number; cw?: number } {
  const p = plantReadSchema.safeParse(raw ?? {});
  return p.success ? { car: p.data.carBracketPitch, cw: p.data.cwBracketPitch } : {};
}

/** The stored data of an installation as the documents read them (plantReadSchema); empty when unreadable. */
export function plantData(raw: unknown): Plant {
  const p = plantReadSchema.safeParse(raw ?? {});
  return p.success ? p.data : {};
}
