// Data of the installation that the calculation and the shaft design do not hold, for the data sheet of the drawing
// set: control, shaft, doors, finishes, frame, rails and brackets, governor, buffers, electrical supply, the parts of
// the car mass. Every field is optional: an empty one prints as a dash. Validated with zod, stored on the project.
import { z } from 'zod';

const text = z.string().trim().max(80).optional();
const num = (max: number) => z.number().finite().min(0).max(max).optional();

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
  carBracketPitch: num(10000),
  cwBracketPitch: num(10000),
  governor: text,
  governorRope: text,
  /** load of the governor on the slab [daN] (P4) */
  governorLoad: num(5000),
  carBuffers: text,
  cwBuffers: text,
  /** safety gear of the car: progressive, instantaneous roller type, instantaneous (impact factor of the rail loads) */
  safetyGear: z.enum(['progressive', 'roller', 'instantaneous']).optional(),
  /** dynamic coefficient on the machine's static load (practice; default 1,5) */
  dynFactor: z.number().finite().min(1).max(3).optional(),
  /** rated and starting current [A] */
  currentIn: num(1000),
  currentStart: num(5000),
  /** supply: power and light voltage [V], frequency [Hz], duty [%] */
  voltage: num(1000),
  lightVoltage: num(1000),
  frequency: num(100),
  duty: num(100),
  /** parts of the car mass [kg]: shell, floor finish, operator and door panels, frame; travelling cables */
  massShell: num(10000),
  massFloor: num(10000),
  massDoors: num(10000),
  massFrame: num(10000),
  massCables: num(1000),
  /** machine and bedframe [kg] */
  massMachine: num(20000),
}).strict();

export type Plant = z.infer<typeof plantSchema>;

export const EMPTY_PLANT: Plant = {};
