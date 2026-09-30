// The installation from one form: shaft, calculation and simulation derived together (src/lib/lift/derive.ts).
export { deriveLift, carMassEstimate } from './derive';
export type { AutoFlags, DerivedKey, LiftDerived, LiftInputs, Origin } from './derive';
export { AUTO_ALL, defaultLift } from './defaults';
export { KL, VOCI_IMPIANTO } from './norme';
export type { CostanteImpianto, VoceImpianto } from './norme';
export { belt, tangent } from './belt';
export type { Belt, BeltEl, Pt2 } from './belt';
export { ropeRig } from './rig';
export type { RopeRig, Wheel } from './rig';
export { LIFT_ENGINE_VERSION } from './version';
