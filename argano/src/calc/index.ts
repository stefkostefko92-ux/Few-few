// Public API of the calculation engine. No I/O, no framework: it runs in the browser and on the server.
export { compute, brakeWindow, sensitivity } from './compute';
export { sizeMachine, grooveFor, compareOptions, ropeFamily, SHEAVE_GRID, ROPE_DIAMETERS, MOTOR_KW } from './sizing';
export { readInputs } from './inputs';
export { deflectorAngle, ropeLean, wrapAngles } from './geometry';
export { grooveF, neqT } from './groove';
export { PRESETS } from './presets';
export { ENGINE_VERSION, canon, snapshotOf, projectResults, projectSizing, projectSensitivity } from './snapshot';
export type { Json, Snapshot } from './snapshot';
export { K, PROFILO, VOCI } from './norme';
export type { Costante, Gruppo, Stato, Voce } from './norme';
export type * from './types';
