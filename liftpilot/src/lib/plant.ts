// Data of the installation that the calculation and the shaft design do not hold, for the data sheet of the drawing
// set: control, shaft, doors, finishes, frame, rails and brackets, governor, buffers, electrical supply, the parts of
// the car mass. Every field is optional: an empty one prints as a dash. Validated with zod, stored on the project.
import { z } from 'zod';

const text = z.string().trim().max(80).optional();

/** The range of each number of the data [unit of the field]: the form's fields take the same. A bracket pitch is never
 *  zero (the brackets are counted by it). */
export const PLANT_RANGE = {
  carBracketPitch: [300, 10000], cwBracketPitch: [300, 10000], governorLoad: [0, 5000], dynFactor: [1, 3], currentIn: [0, 1000], currentStart: [0, 5000],
  voltage: [0, 1000], lightVoltage: [0, 1000], frequency: [0, 100], duty: [0, 100], massShell: [0, 10000], massFloor: [0, 10000], massDoors: [0, 10000],
  massFrame: [0, 10000], massCables: [0, 1000], massMachine: [0, 20000],
} as const satisfies Readonly<Record<string, readonly [number, number]>>;
export type PlantNumber = keyof typeof PLANT_RANGE;
const num = (k: PlantNumber) => z.number().finite().min(PLANT_RANGE[k][0]).max(PLANT_RANGE[k][1]).optional();

export const plantSchema = z.object({
  /** machine as named on the drawings, e.g. "MONTANARI M 73 (Sx)" */
  machine: text,
  control: text,
  shaft: text,
  carFinish: text,
  landingDoors: text,
  carDoors: text,
  carFrame: text,
  carRails: z.enum(['new', 'existing']).optional(),
  cwRails: z.enum(['new', 'existing']).optional(),
  carBrackets: text,
  cwBrackets: text,
  /** spacing of the rail brackets [mm] */
  carBracketPitch: num('carBracketPitch'),
  cwBracketPitch: num('cwBracketPitch'),
  governor: text,
  governorRope: text,
  /** load of the governor on the slab [daN] (P4) */
  governorLoad: num('governorLoad'),
  carBuffers: text,
  cwBuffers: text,
  /** safety gear of the car: progressive, instantaneous roller type, instantaneous (impact factor of the rail loads) */
  safetyGear: z.enum(['progressive', 'roller', 'instantaneous']).optional(),
  /** dynamic coefficient on the machine's static load (practice; default 1,5) */
  dynFactor: num('dynFactor'),
  /** rated and starting current [A] */
  currentIn: num('currentIn'),
  currentStart: num('currentStart'),
  /** supply: power and light voltage [V], frequency [Hz], duty [%] */
  voltage: num('voltage'),
  lightVoltage: num('lightVoltage'),
  frequency: num('frequency'),
  duty: num('duty'),
  /** parts of the car mass [kg]: shell, floor finish, operator and door panels, frame; travelling cables */
  massShell: num('massShell'),
  massFloor: num('massFloor'),
  massDoors: num('massDoors'),
  massFrame: num('massFrame'),
  massCables: num('massCables'),
  /** machine and bedframe [kg] */
  massMachine: num('massMachine'),
}).strict();

export type Plant = z.infer<typeof plantSchema>;

export const EMPTY_PLANT: Plant = {};
